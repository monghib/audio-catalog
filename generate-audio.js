// Renders the demo catalog's audio (public/audio) and the preset query clips (public/presets).
// Usage: npm run generate [-- --force]   (existing files are skipped unless --force)
const fs = require('fs');
const synth = require('./lib/synth');
const podcast = require('./lib/podcast');
const { speak } = require('./lib/tts');
const { encodeWav } = require('./lib/wav');
const { generateCatalog, PRESETS, AUDIO_DIR, PRESET_DIR, mulberry32, hash } = require('./lib/catalog');

const MUSIC_SEC = 20;
const PRESET_SEC = 12;
const force = process.argv.includes('--force');

function render(item, seed, dur) {
  const rand = mulberry32(seed);
  if (item.genre === 'hiphop') return synth.hiphop(rand, dur, speak(podcast.rapJobs(item, rand)));
  if (item.genre === 'classical') return synth.classical(rand, dur, item.title);
  if (item.genre === 'podcast') {
    // hosts are seeded by show name so every episode of a show has the same voices
    const jobs = podcast.episodeJobs(item, rand, mulberry32(hash(item.creator)));
    return podcast.mixEpisode(item, jobs, speak(jobs), rand);
  }
  return synth[item.genre](rand, dur);
}

function write(file, samples) {
  fs.writeFileSync(file, encodeWav(samples, synth.SR));
}

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(PRESET_DIR, { recursive: true });

for (const item of generateCatalog()) {
  if (!force && fs.existsSync(item.audioFile)) continue;
  write(item.audioFile, render(item, item.trackId * 7919, MUSIC_SEC));
  console.log(`#${item.trackId} ${item.category} - ${item.title}`);
}

for (const p of PRESETS) {
  if (!force && fs.existsSync(p.audioFile)) continue;
  const full = render(p, p.seed, PRESET_SEC + 2);
  // skip intros: take a 12 s excerpt (from 4 s in for podcasts, 1 s for music)
  const start = Math.round((p.genre === 'podcast' ? 4 : 1) * synth.SR);
  write(p.audioFile, synth.finalize(full.slice(start, start + PRESET_SEC * synth.SR), { drive: 1 }));
  console.log(`preset ${p.id}`);
}
console.log('Audio ready.');
