// Audio embeddings with CLAP (LAION, via transformers.js / ONNX, runs locally on CPU).
// Every clip is cut into overlapping 10 s windows; each window becomes one 512-dim vector.
const path = require('path');
const { AutoProcessor, ClapAudioModelWithProjection, env } = require('@huggingface/transformers');

env.cacheDir = path.join(__dirname, '..', '.model-cache');

const MODEL_ID = 'Xenova/clap-htsat-unfused';
const SAMPLE_RATE = 48000; // CLAP expects 48 kHz mono
const DIMENSIONS = 512;
const WINDOW_SEC = 10;
const HOP_SEC = 2.5;
const TARGET_RMS = 0.1;

let loading = null;
function load() {
  loading ??= Promise.all([
    AutoProcessor.from_pretrained(MODEL_ID),
    ClapAudioModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
  ]).then(([processor, model]) => ({ processor, model }));
  return loading;
}

const normalize = (v) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
};

// Level-match every clip so loudness doesn't affect similarity
function levelMatch(samples) {
  let sum = 0;
  for (const x of samples) sum += x * x;
  const rms = Math.sqrt(sum / samples.length) || 1;
  const g = TARGET_RMS / rms;
  return samples.map((x) => Math.max(-1, Math.min(1, x * g)));
}

function windows(samples) {
  const win = WINDOW_SEC * SAMPLE_RATE, hop = HOP_SEC * SAMPLE_RATE;
  if (samples.length <= win) return [{ start: 0, chunk: samples }];
  const out = [];
  for (let s = 0; s + win <= samples.length; s += hop) out.push({ start: s / SAMPLE_RATE, chunk: samples.subarray(s, s + win) });
  const last = samples.length - win;
  if (out[out.length - 1].start * SAMPLE_RATE < last) out.push({ start: last / SAMPLE_RATE, chunk: samples.subarray(last) });
  return out;
}

async function embedChunk(chunk) {
  const { processor, model } = await load();
  const inputs = await processor(levelMatch(chunk));
  const { audio_embeds } = await model(inputs);
  return normalize(Array.from(audio_embeds.data)).map((x) => Number(x.toFixed(6)));
}

// [{ start, embedding }] for every window of a 48 kHz mono clip
async function embedWindows(samples) {
  const out = [];
  for (const w of windows(samples)) out.push({ start: w.start, embedding: await embedChunk(w.chunk) });
  return out;
}

// One vector for a whole clip: mean of its window vectors
function meanEmbedding(segs) {
  const acc = new Array(DIMENSIONS).fill(0);
  for (const s of segs) s.embedding.forEach((x, i) => (acc[i] += x));
  return normalize(acc).map((x) => Number(x.toFixed(6)));
}

module.exports = { load, embedWindows, meanEmbedding, SAMPLE_RATE, DIMENSIONS, WINDOW_SEC, HOP_SEC };
