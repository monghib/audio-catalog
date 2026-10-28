require('dotenv').config();
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { generateCatalog } = require('./lib/catalog');
const { decodeWav, resample } = require('./lib/wav');
const clap = require('./lib/clap');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'audio_catalog';
const collName = process.env.COLLECTION || 'tracks';
const indexName = process.env.INDEX_NAME || 'audio_vector_index';
const segCollName = process.env.SEGMENT_COLLECTION || 'segments';
const segIndexName = process.env.SEGMENT_INDEX_NAME || 'segment_vector_index';

if (!uri) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and set it.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Coarse waveform for the UI
function peaks(samples, n = 48) {
  const step = Math.floor(samples.length / n);
  return Array.from({ length: n }, (_, i) => {
    let m = 0;
    for (let j = i * step; j < (i + 1) * step; j++) m = Math.max(m, Math.abs(samples[j]));
    return Number(m.toFixed(3));
  });
}

const vectorIndex = (filters) => ({
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: clap.DIMENSIONS, similarity: 'cosine' },
    ...filters.map((path) => ({ type: 'filter', path })),
  ],
});

// Create the index, or update it in place if its definition changed (e.g. new dimensions)
async function ensureIndex(col, name, definition) {
  const [existing] = await col.listSearchIndexes(name).toArray();
  if (!existing) {
    await col.createSearchIndex({ name, type: 'vectorSearch', definition });
    console.log(`Creating vector index "${name}"...`);
  } else if (JSON.stringify(existing.latestDefinition) !== JSON.stringify(definition)) {
    await col.updateSearchIndex(name, definition);
    console.log(`Updating vector index "${name}"...`);
    await sleep(5000);
  } else {
    console.log(`Vector index "${name}" already exists`);
  }
}

async function waitQueryable(col, name) {
  for (let i = 0; i < 120; i++) {
    const [idx] = await col.listSearchIndexes(name).toArray();
    if (idx && idx.queryable && idx.status === 'READY') return console.log(`\nIndex "${name}" is ready.`);
    process.stdout.write('.');
    await sleep(5000);
  }
  throw new Error(`Index "${name}" did not become ready in time`);
}

async function main() {
  const items = generateCatalog();
  const missing = items.filter((t) => !fs.existsSync(t.audioFile));
  if (missing.length) throw new Error(`${missing.length} audio files missing. Run: npm run generate`);

  console.log('Loading CLAP audio model (first run downloads it)...');
  await clap.load();

  const tracks = [], segments = [];
  for (const item of items) {
    const { samples, sampleRate } = decodeWav(fs.readFileSync(item.audioFile));
    const audio = resample(samples, sampleRate, clap.SAMPLE_RATE);
    const windows = await clap.embedWindows(audio);
    const { audioFile, genre, ...meta } = item;
    tracks.push({
      ...meta,
      durationSec: Math.round(samples.length / sampleRate),
      peaks: peaks(samples),
      segmentCount: windows.length,
      embedding: clap.meanEmbedding(windows),
    });
    for (const w of windows) segments.push({ trackId: item.trackId, kind: item.kind, category: item.category, start: w.start, embedding: w.embedding });
    process.stdout.write(`\rEmbedded ${tracks.length}/${items.length} (${segments.length} segments)`);
  }
  console.log();

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection(collName), segCol = db.collection(segCollName);

  await col.deleteMany({});
  await col.insertMany(tracks);
  await col.createIndex({ trackId: 1 }, { unique: true });
  await segCol.deleteMany({});
  await segCol.insertMany(segments);
  await segCol.createIndex({ trackId: 1, start: 1 });
  console.log(`Inserted ${tracks.length} tracks into ${dbName}.${collName} and ${segments.length} segments into ${dbName}.${segCollName}`);

  // Collections must exist before creating search indexes; they do now.
  await ensureIndex(col, indexName, vectorIndex(['kind', 'category']));
  await ensureIndex(segCol, segIndexName, vectorIndex(['kind', 'category']));
  await waitQueryable(col, indexName);
  await waitQueryable(segCol, segIndexName);
  console.log('Ready to go: npm start');

  await client.close();
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
