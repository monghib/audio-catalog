require('dotenv').config();
const path = require('path');
const express = require('express');
const { MongoClient } = require('mongodb');
const { PRESETS } = require('./lib/catalog');
const { decodeWav, resample } = require('./lib/wav');
const clap = require('./lib/clap');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'audio_catalog';
const collName = process.env.COLLECTION || 'tracks';
const indexName = process.env.INDEX_NAME || 'audio_vector_index';
const segCollName = process.env.SEGMENT_COLLECTION || 'segments';
const segIndexName = process.env.SEGMENT_INDEX_NAME || 'segment_vector_index';
const port = process.env.PORT || 3000;

if (!uri) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and set it.');
  process.exit(1);
}

const client = new MongoClient(uri);
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const NO_VECTOR = { embedding: 0 };
const col = () => client.db(dbName).collection(collName);
const segCol = () => client.db(dbName).collection(segCollName);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Catalog listing with optional text search + filters
app.get('/api/tracks', async (req, res) => {
  try {
    const { q, kind, category } = req.query;
    const filter = {};
    if (kind) filter.kind = String(kind);
    if (category) filter.category = String(category);
    if (q) {
      const rx = new RegExp(escapeRegex(String(q)), 'i');
      filter.$or = [{ title: rx }, { creator: rx }, { category: rx }];
    }
    const tracks = await col().find(filter, { projection: NO_VECTOR }).sort({ trackId: 1 }).toArray();
    res.json(tracks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/categories', async (_req, res) => {
  try {
    const cats = await col()
      .aggregate([
        { $group: { _id: { category: '$category', kind: '$kind', hue: '$hue' }, count: { $sum: 1 } } },
        { $sort: { '_id.kind': 1, '_id.category': 1 } },
      ])
      .toArray();
    res.json(cats.map((c) => ({ ...c._id, count: c.count })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/presets', (_req, res) => {
  res.json(PRESETS.map(({ id, label, category, audioUrl }) => ({ id, label, category, audioUrl })));
});

// Vector search: most similar tracks to the selected one (whole-track embeddings)
app.get('/api/tracks/:id/similar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const kind = req.query.kind ? String(req.query.kind) : null;

    const source = await col().findOne({ trackId: id });
    if (!source) return res.status(404).json({ error: 'Track not found' });

    const vs = {
      index: indexName,
      path: 'embedding',
      queryVector: source.embedding,
      numCandidates: 100, // catalog is small; scan all for exact-quality recall
      limit: limit + 1, // +1 because the source matches itself
    };
    if (kind) vs.filter = { kind };

    const results = await col()
      .aggregate([
        { $vectorSearch: vs },
        { $match: { trackId: { $ne: id } } },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $project: NO_VECTOR },
        { $limit: limit },
      ])
      .toArray();

    const { embedding, ...selected } = source;
    res.json({ selected, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Audio in, audio out: embed the posted WAV with CLAP, search 10 s catalog segments,
// and return the best-matching tracks with the timestamp of the matching segment.
app.post('/api/search/audio', express.raw({ type: ['audio/wav', 'audio/x-wav', 'application/octet-stream'], limit: '20mb' }), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const kind = req.query.kind ? String(req.query.kind) : null;
    if (!req.body?.length) return res.status(400).json({ error: 'POST a WAV file as the request body' });

    let t = Date.now();
    const { samples, sampleRate } = decodeWav(req.body);
    const audio = resample(samples, sampleRate, clap.SAMPLE_RATE).subarray(0, 30 * clap.SAMPLE_RATE);
    const queryVector = clap.meanEmbedding(await clap.embedWindows(audio));
    const embedMs = Date.now() - t;

    const vs = { index: segIndexName, path: 'embedding', queryVector, numCandidates: 400, limit: 100 };
    if (kind) vs.filter = { kind };

    t = Date.now();
    const results = await segCol()
      .aggregate([
        { $vectorSearch: vs },
        { $project: { trackId: 1, start: 1, score: { $meta: 'vectorSearchScore' } } },
        { $sort: { score: -1 } },
        // best segment per track
        { $group: { _id: '$trackId', score: { $first: '$score' }, matchStart: { $first: '$start' } } },
        { $sort: { score: -1 } },
        { $limit: limit },
        { $lookup: { from: collName, localField: '_id', foreignField: 'trackId', as: 'track', pipeline: [{ $project: NO_VECTOR }] } },
        { $unwind: '$track' },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$track', { score: '$score', matchStart: '$matchStart' }] } } },
      ])
      .toArray();

    res.json({ query: { durationSec: Number((samples.length / sampleRate).toFixed(1)), embedMs, searchMs: Date.now() - t }, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/status', async (_req, res) => {
  try {
    const [count, segments] = await Promise.all([col().countDocuments(), segCol().countDocuments()]);
    const [[idx], [segIdx]] = await Promise.all([col().listSearchIndexes(indexName).toArray(), segCol().listSearchIndexes(segIndexName).toArray()]);
    const ready = !!(idx?.queryable && segIdx?.queryable);
    res.json({ count, segments, indexQueryable: ready, indexStatus: !idx || !segIdx ? 'MISSING' : ready ? 'READY' : `${idx.status}/${segIdx.status}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

Promise.all([client.connect(), clap.load()])
  .then(() => app.listen(port, () => console.log(`Catalog running at http://localhost:${port}`)))
  .catch((e) => {
    console.error('Startup failed:', e.message);
    process.exit(1);
  });
