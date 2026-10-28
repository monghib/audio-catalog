// Procedural music generator: renders genre-styled clips so the demo catalog has real audio.
// Everything is driven by a seeded RNG, so a given seed always renders the same track.

const SR = 24000;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const lpCoef = (fc) => 1 - Math.exp((-TAU * fc) / SR);
const buffer = (sec) => new Float32Array(Math.ceil(sec * SR));
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const range = (rand, a, b) => a + rand() * (b - a);

function mixInto(bus, t, note, gain = 1) {
  const o = Math.round(t * SR);
  for (let i = Math.max(0, -o); i < note.length && o + i < bus.length; i++) bus[o + i] += note[i] * gain;
}

// Attack / release envelope for a note held `dur` seconds
function ar(t, dur, attack, release) {
  if (t < attack) return t / attack;
  if (t < dur) return 1;
  return Math.max(0, 1 - (t - dur) / release);
}

// ---------- drums ----------
function kick({ pitch = 52, decay = 0.4, drive = 1.5 } = {}) {
  const n = buffer(decay * 1.5);
  let ph = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    ph += (TAU * pitch * (1 + 2.5 * Math.exp(-t * 35))) / SR;
    n[i] = Math.tanh(drive * Math.sin(ph) * Math.exp((-t * 4) / decay));
  }
  return n;
}

function snare(rand, { tone = 190, decay = 0.2, noise = 0.7, lo = 900, hi = 8000 } = {}) {
  const n = buffer(decay * 1.5);
  const aLo = lpCoef(lo), aHi = lpCoef(hi);
  let ph = 0, l = 0, h = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    ph += (TAU * tone * (1 + 0.5 * Math.exp(-t * 40))) / SR;
    const w = rand() * 2 - 1;
    l += aLo * (w - l);
    h += aHi * (w - h);
    n[i] = Math.sin(ph) * Math.exp(-t * 25) * (1 - noise) + (h - l) * 1.8 * noise * Math.exp((-t * 4) / decay);
  }
  return n;
}

function hat(rand, { decay = 0.05 } = {}) {
  const n = buffer(decay * 2);
  const a = lpCoef(6500);
  let l = 0;
  for (let i = 0; i < n.length; i++) {
    const w = rand() * 2 - 1;
    l += a * (w - l);
    n[i] = (w - l) * Math.exp((-(i / SR) * 4) / decay);
  }
  return n;
}

// Metallic cymbal: inharmonic square partials + noise (ride, or crash with more noise)
function cymbal(rand, { decay = 1.0, base = 420, noise = 0.3 } = {}) {
  const n = buffer(decay * 1.2);
  const ratios = [1, 1.483, 1.932, 2.546, 2.63, 3.897];
  const a = lpCoef(3500);
  let l = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const r of ratios) s += Math.sin(TAU * base * r * t) > 0 ? 1 : -1;
    const x = (s / ratios.length) * (1 - noise) + (rand() * 2 - 1) * noise;
    l += a * (x - l);
    n[i] = (x - l) * Math.exp((-t * 3) / decay) * Math.min(1, t * 500);
  }
  return n;
}

function clap(rand) {
  const n = buffer(0.25);
  const aLo = lpCoef(800), aHi = lpCoef(3500);
  let l = 0, h = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    const burst = t < 0.03 ? Math.exp(-((t % 0.01) * 300)) : Math.exp(-(t - 0.03) * 22);
    const w = rand() * 2 - 1;
    l += aLo * (w - l);
    h += aHi * (w - h);
    n[i] = (h - l) * 2.5 * burst;
  }
  return n;
}

// ---------- tonal instruments ----------
function bass808(freq, dur) {
  const n = buffer(dur + 0.1);
  let ph = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    ph += (TAU * freq * (1 + Math.exp(-t * 30))) / SR;
    n[i] = (Math.tanh(1.8 * Math.sin(ph)) / Math.tanh(1.8)) * Math.exp(-t * 1.2) * ar(t, dur, 0.003, 0.08);
  }
  return n;
}

function pluckBass(freq, dur, { bright = 1500 } = {}) {
  const n = buffer(dur + 0.06);
  let ph = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    ph = (ph + freq / SR) % 1;
    const a = lpCoef(180 + bright * Math.exp(-t * 12));
    y1 += a * (2 * ph - 1 - y1);
    y2 += a * (y1 - y2);
    n[i] = y2 * 1.6 * Math.exp(-t * 2) * ar(t, dur, 0.005, 0.05);
  }
  return n;
}

function subSine(freq, dur) {
  const n = buffer(dur + 0.08);
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    n[i] = Math.sin(TAU * freq * t) * Math.exp(-t * 1.5) * ar(t, dur, 0.01, 0.07);
  }
  return n;
}

// FM electric piano / vibraphone
function epiano(freq, dur, { index = 1.5, trem = 0.15 } = {}) {
  const n = buffer(dur + 0.3);
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    const mod = Math.sin(TAU * freq * t) * (index * Math.exp(-t * 6) + 0.2);
    n[i] = Math.sin(TAU * freq * t + mod) * Math.exp(-t * 1.2) * (1 + trem * Math.sin(TAU * 4.5 * t)) * ar(t, dur, 0.004, 0.25);
  }
  return n;
}

function piano(freq, dur) {
  const len = Math.min(dur + 0.4, 4);
  const n = buffer(len);
  const parts = [];
  for (let k = 1; k <= 8; k++) {
    if (k * freq > SR / 2.2) break;
    parts.push({ f: k * freq * Math.sqrt(1 + 0.0004 * k * k), a: 1 / k ** 1.3, d: 0.8 + 0.6 * k * Math.sqrt(freq / 440) });
  }
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const p of parts) s += p.a * Math.sin(TAU * p.f * t) * Math.exp(-t * p.d);
    const damp = t > dur ? Math.exp(-(t - dur) * 12) : 1;
    n[i] = s * 0.6 * damp * Math.min(1, t * 400);
  }
  return n;
}

// Detuned saw ensemble with vibrato and slow attack (strings / pads)
function strings(rand, freq, dur, { attack = 0.35, release = 0.5, cutoff = 1800, vib = 0.004, voices = 3, detune = 0.004 } = {}) {
  const n = buffer(dur + release);
  const ph = Array.from({ length: voices }, () => rand());
  const det = Array.from({ length: voices }, (_, v) => 1 + (v - (voices - 1) / 2) * detune);
  const a = lpCoef(cutoff);
  const vibPh = rand() * TAU;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    const f = freq * (1 + vib * Math.sin(TAU * 5.5 * t + vibPh));
    let s = 0;
    for (let v = 0; v < voices; v++) {
      ph[v] = (ph[v] + (f * det[v]) / SR) % 1;
      s += 2 * ph[v] - 1;
    }
    y1 += a * (s / voices - y1);
    y2 += a * (y1 - y2);
    n[i] = y2 * ar(t, dur, attack, release);
  }
  return n;
}

function sawLead(rand, freq, dur, { cutoff = 2500, envAmt = 0, vib = 0, attack = 0.01, release = 0.08, breath = 0 } = {}) {
  const n = buffer(dur + release);
  let ph = rand(), y1 = 0, y2 = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    ph = (ph + (freq * (1 + vib * Math.sin(TAU * 5 * t) * Math.min(1, t * 3))) / SR) % 1;
    const a = lpCoef(cutoff + envAmt * Math.exp(-t * 10));
    const x = 2 * ph - 1 + breath * (rand() * 2 - 1);
    y1 += a * (x - y1);
    y2 += a * (y1 - y2);
    n[i] = y2 * ar(t, dur, attack, release);
  }
  return n;
}

function supersaw(rand, freq, dur, opts = {}) {
  return strings(rand, freq, dur, { attack: 0.01, release: 0.15, cutoff: 3500, vib: 0, voices: 5, detune: 0.006, ...opts });
}

// Karplus-Strong plucked string (guitar, harp, upright bass)
function ksPluck(rand, freq, dur, { damp = 0.996, bright = 0.5, ring = 0.3 } = {}) {
  const n = buffer(dur + ring);
  const N = Math.max(2, Math.round(SR / freq));
  const line = new Float32Array(N);
  let l = 0;
  for (let i = 0; i < N; i++) {
    const w = rand() * 2 - 1;
    l += bright * (w - l);
    line[i] = l;
  }
  let idx = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    const out = line[idx];
    const next = line[(idx + 1) % N];
    line[idx] = (t > dur ? damp * 0.97 : damp) * 0.5 * (out + next);
    idx = (idx + 1) % N;
    n[i] = out;
  }
  return n;
}

function distGuitar(rand, midis, dur) {
  const n = buffer(dur + 0.1);
  for (const m of midis) mixInto(n, 0, ksPluck(rand, mtof(m), dur, { damp: 0.998, bright: 0.8, ring: 0.1 }), 0.5);
  const a = lpCoef(3200);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n.length; i++) {
    y1 += a * (Math.tanh(n[i] * 7) - y1);
    y2 += a * (y1 - y2);
    n[i] = y2 * 0.7;
  }
  return n;
}

// ---------- bus effects ----------
function lowpass(buf, fc, poles = 1) {
  const a = lpCoef(fc);
  for (let p = 0; p < poles; p++) {
    let y = 0;
    for (let i = 0; i < buf.length; i++) buf[i] = y += a * (buf[i] - y);
  }
  return buf;
}

function highpass(buf, fc) {
  const a = lpCoef(fc);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    buf[i] -= y;
  }
  return buf;
}

// Freeverb-style mono reverb
function reverb(buf, { mix = 0.25, room = 0.82, damp = 0.3 } = {}) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({ d: Math.round(d * scale), b: null, i: 0, f: 0 }));
  const alls = [556, 441, 341].map((d) => ({ d: Math.round(d * scale), b: null, i: 0 }));
  for (const c of [...combs, ...alls]) c.b = new Float32Array(c.d);
  const out = new Float32Array(buf.length);
  for (let n = 0; n < buf.length; n++) {
    const x = buf[n] * 0.015;
    let s = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      c.f = y * (1 - damp) + c.f * damp;
      c.b[c.i] = x + c.f * room;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    for (const a of alls) {
      const y = a.b[a.i];
      a.b[a.i] = s + y * 0.5;
      a.i = (a.i + 1) % a.d;
      s = y - s;
    }
    out[n] = s;
  }
  for (let n = 0; n < buf.length; n++) buf[n] += out[n] * mix * 3;
  return buf;
}

function delay(buf, sec, { feedback = 0.35, mix = 0.3 } = {}) {
  const d = Math.round(sec * SR);
  const line = new Float32Array(d);
  for (let i = 0, j = 0; i < buf.length; i++, j = (j + 1) % d) {
    const y = line[j];
    line[j] = buf[i] + y * feedback;
    buf[i] += y * mix;
  }
  return buf;
}

// Duck the bus after each kick (the "pumping" EDM sound)
function sidechain(buf, times, { depth = 0.65, release = 0.2 } = {}) {
  const gain = new Float32Array(buf.length).fill(1);
  const r = Math.round(release * SR);
  for (const t of times) {
    const o = Math.round(t * SR);
    for (let i = 0; i < r && o + i < buf.length; i++) gain[o + i] = Math.min(gain[o + i], 1 - depth * (1 - i / r));
  }
  for (let i = 0; i < buf.length; i++) buf[i] *= gain[i];
  return buf;
}

function vinyl(buf, rand, amount = 1) {
  let l = 0;
  const a = lpCoef(2500);
  for (let i = 0; i < buf.length; i++) {
    l += a * (rand() * 2 - 1 - l);
    buf[i] += l * 0.012 * amount;
    if (rand() < 7 / SR) buf[i] += (rand() - 0.5) * 0.25 * amount;
  }
  return buf;
}

function mixBuses(len, parts) {
  const out = buffer(len);
  for (const [bus, g] of parts) for (let i = 0; i < out.length; i++) out[i] += bus[i] * g;
  return out;
}

function finalize(buf, { drive = 1.1 } = {}) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * drive);
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const g = 0.89 / (peak || 1);
  const fadeIn = 0.02 * SR, fadeOut = 0.6 * SR;
  for (let i = 0; i < buf.length; i++) {
    const f = Math.min(1, i / fadeIn, (buf.length - i) / fadeOut);
    buf[i] *= g * f;
  }
  return buf;
}

// ---------- harmony ----------
const CHORDS = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
  m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], sus2: [0, 2, 7],
};
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

// Chord tones of [degree, quality] in key `key`, centred near `center`
function chordNotes(key, [deg, q], center = 60) {
  let root = key + deg;
  while (root > center - 2) root -= 12;
  while (root < center - 14) root += 12;
  return CHORDS[q].map((i) => root + i);
}

function scaleNotes(key, scale, low, high) {
  const out = [];
  for (let m = low; m <= high; m++) if (SCALES[scale].includes((((m - key) % 12) + 12) % 12)) out.push(m);
  return out;
}

// Random-walk melody that lands on chord tones at the start of each beat
function melody(rand, { key, scale, low, high, bars, beat, prog, swing = 0.5, step = 0.5, rest = 0.25 }) {
  const notes = scaleNotes(key, scale, low, high);
  let idx = Math.floor(notes.length / 2);
  const out = [];
  for (let b = 0; b < bars; b++) {
    const chordPcs = chordNotes(key, prog[b % prog.length]).map((m) => ((m % 12) + 12) % 12);
    for (let pos = 0; pos < 4; pos += step) {
      if (rand() < rest) continue;
      if (pos % 1 === 0) {
        const tones = notes.map((m, i) => [m, i]).filter(([m]) => chordPcs.includes(m % 12));
        const near = tones.sort((x, y) => Math.abs(x[1] - idx) - Math.abs(y[1] - idx))[Math.floor(rand() * 2)];
        if (near) idx = near[1];
      } else {
        idx = Math.max(0, Math.min(notes.length - 1, idx + pick(rand, [-2, -1, -1, 1, 1, 2])));
      }
      const frac = pos % 1;
      const t = (b * 4 + Math.floor(pos)) * beat + (frac === 0.5 ? swing : frac) * beat;
      out.push({ t, dur: step * beat * range(rand, 0.8, 1.6), midi: notes[idx] });
    }
  }
  return out;
}

// Beat position -> seconds, swinging the off-beat eighth
const at = (bar, pos, beat, swing = 0.5) => (bar * 4 + Math.floor(pos)) * beat + ((pos % 1) === 0.5 ? swing : pos % 1) * beat;

// ---------- genres ----------
const PROGS = {
  lofi: [[[2, 'm9'], [7, 'dom7'], [0, 'maj9'], [9, 'm7']], [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']], [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [0, 'maj7']], [[9, 'm9'], [5, 'maj7'], [0, 'maj7'], [7, 'dom7']]],
  jazz: [[[2, 'm7'], [7, 'dom7'], [0, 'maj7'], [0, 'maj7']], [[0, 'maj7'], [9, 'dom7'], [2, 'm7'], [7, 'dom7']], [[0, 'm7'], [5, 'm7'], [10, 'dom7'], [3, 'maj7']], [[4, 'm7'], [9, 'dom7'], [2, 'm7'], [7, 'dom7']]],
  electronic: [[[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], [[0, 'min'], [10, 'maj'], [8, 'maj'], [10, 'maj']], [[0, 'min'], [5, 'min'], [8, 'maj'], [7, 'maj']], [[0, 'sus2'], [8, 'maj'], [5, 'min'], [7, 'sus2']]],
  rock: [[[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']], [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']], [[0, 'maj'], [10, 'maj'], [5, 'maj'], [0, 'maj']]],
  classical: [[[0, 'min'], [5, 'min'], [7, 'dom7'], [0, 'min']], [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj']], [[0, 'maj'], [4, 'min'], [9, 'min'], [7, 'dom7']]],
  hiphop: [[[0, 'm7'], [8, 'maj7']], [[0, 'm9'], [5, 'm7']], [[0, 'm7'], [3, 'maj7'], [8, 'maj7'], [7, 'dom7']], [[0, 'm7'], [10, 'dom7'], [8, 'maj7'], [7, 'm7']]],
};

function lofi(rand, dur) {
  const bpm = range(rand, 70, 88), beat = 60 / bpm, swing = range(rand, 0.58, 0.66);
  const key = 50 + Math.floor(rand() * 10), prog = pick(rand, PROGS.lofi);
  const inst = pick(rand, ['epiano', 'piano', 'guitar']);
  const bars = Math.ceil(dur / (4 * beat));
  const drums = buffer(dur), keys = buffer(dur), bass = buffer(dur);
  const kickPat = pick(rand, [[0, 2.5], [0, 1.5, 2.5], [0, 2, 2.75]]);
  for (let b = 0; b < bars; b++) {
    const chord = chordNotes(key, prog[b % prog.length], 66);
    for (const p of kickPat) mixInto(drums, at(b, p, beat, swing), kick({ pitch: 48, decay: 0.35, drive: 1.2 }), 0.9);
    for (const p of [1, 3]) mixInto(drums, at(b, p, beat, swing), snare(rand, { tone: 180, decay: 0.18, hi: 4500 }), 0.5);
    for (let p = 0; p < 4; p += 0.5) mixInto(drums, at(b, p, beat, swing), hat(rand, { decay: 0.04 }), p % 1 ? 0.12 : 0.2);
    if (inst === 'guitar') {
      chord.concat(chord[1] + 12).forEach((m, i) => mixInto(keys, at(b, i * 0.5, beat, swing), ksPluck(rand, mtof(m), beat * 2, { damp: 0.995, bright: 0.35 }), 0.5));
    } else {
      const voice = inst === 'epiano' ? (m, d) => epiano(mtof(m), d) : (m, d) => piano(mtof(m), d);
      for (const m of chord) mixInto(keys, b * 4 * beat, voice(m, beat * 3.6), 0.22);
      if (rand() < 0.5) for (const m of chord) mixInto(keys, at(b, 2.5, beat, swing), voice(m, beat), 0.12);
    }
    const root = chordNotes(key, prog[b % prog.length], 44)[0];
    mixInto(bass, b * 4 * beat, subSine(mtof(root), beat * 1.6), 0.8);
    mixInto(bass, at(b, 2.5, beat, swing), subSine(mtof(root), beat), 0.6);
  }
  if (rand() < 0.6) {
    for (const n of melody(rand, { key, scale: 'major', low: 67, high: 84, bars, beat, prog, swing, step: 1, rest: 0.45 }))
      mixInto(keys, n.t, epiano(mtof(n.midi), n.dur, { index: 0.8 }), 0.18);
  }
  lowpass(drums, 5000);
  reverb(lowpass(keys, 2800), { mix: 0.3 });
  const out = mixBuses(dur, [[drums, 0.8], [keys, 0.7], [bass, 0.7]]);
  return finalize(lowpass(vinyl(out, rand, 1.2), 4500), { drive: 1.4 });
}

function jazz(rand, dur) {
  const bpm = range(rand, 120, 165), beat = 60 / bpm, swing = 0.66;
  const key = 50 + Math.floor(rand() * 10), prog = pick(rand, PROGS.jazz);
  const lead = pick(rand, ['sax', 'vibes', 'piano', 'none']);
  const bars = Math.ceil(dur / (4 * beat));
  const drums = buffer(dur), comp = buffer(dur), bass = buffer(dur), solo = buffer(dur);
  for (let b = 0; b < bars; b++) {
    for (const p of [0, 1, 1.5, 2, 3, 3.5]) mixInto(drums, at(b, p, beat, swing), cymbal(rand, { decay: 0.9, base: 520, noise: 0.45 }), p % 1 ? 0.18 : 0.28);
    for (const p of [1, 3]) mixInto(drums, at(b, p, beat), hat(rand, { decay: 0.03 }), 0.25);
    for (let p = 0.5; p < 4; p += 1) if (rand() < 0.15) mixInto(drums, at(b, p, beat, swing), snare(rand, { decay: 0.1, noise: 0.8 }), 0.15);

    const cur = prog[b % prog.length], next = prog[(b + 1) % prog.length];
    const tones = chordNotes(key, cur, 46);
    const nextRoot = chordNotes(key, next, 46)[0];
    const walk = [tones[0], pick(rand, tones.slice(1)), pick(rand, tones), nextRoot + pick(rand, [-1, 1])];
    walk.forEach((m, i) => mixInto(bass, (b * 4 + i) * beat, ksPluck(rand, mtof(m), beat * 0.95, { damp: 0.993, bright: 0.25, ring: 0.05 }), 0.9));

    const shell = chordNotes(key, cur, 68).slice(1);
    const hits = rand() < 0.5 ? [pick(rand, [0, 0.5, 1.5])] : [pick(rand, [0, 0.5]), pick(rand, [2, 2.5, 3.5])];
    for (const p of hits) for (const m of shell) mixInto(comp, at(b, p, beat, swing), piano(mtof(m), beat * range(rand, 0.4, 0.9)), 0.2);
  }
  if (lead !== 'none') {
    const line = melody(rand, { key, scale: 'dorian', low: 62, high: 82, bars, beat, prog, swing, step: 0.5, rest: 0.3 });
    for (const n of line) {
      const f = mtof(n.midi);
      const note = lead === 'sax' ? sawLead(rand, f, n.dur, { cutoff: 1400, envAmt: 1200, vib: 0.006, attack: 0.03, breath: 0.15 })
        : lead === 'vibes' ? epiano(f * 2, n.dur, { index: 0.4, trem: 0.4 }) : piano(f * 2, n.dur);
      mixInto(solo, n.t, note, lead === 'sax' ? 0.3 : 0.22);
    }
  }
  const out = mixBuses(dur, [[drums, 0.7], [comp, 0.8], [bass, 0.9], [solo, 0.9]]);
  return finalize(reverb(out, { mix: 0.18, room: 0.75 }));
}

function electronic(rand, dur) {
  const bpm = range(rand, 120, 132), beat = 60 / bpm;
  const key = 45 + Math.floor(rand() * 10), prog = pick(rand, PROGS.electronic);
  const layers = pick(rand, [['pad', 'arp'], ['stabs', 'arp'], ['pad', 'stabs'], ['arp']]);
  const bars = Math.ceil(dur / (4 * beat));
  const drums = buffer(dur), synth = buffer(dur), bass = buffer(dur);
  const kicks = [];
  for (let b = 0; b < bars; b++) {
    const chord = chordNotes(key, prog[b % prog.length], 66);
    for (let p = 0; p < 4; p++) {
      kicks.push(at(b, p, beat));
      mixInto(drums, at(b, p, beat), kick({ pitch: 50, decay: 0.32, drive: 2.5 }), 1);
      mixInto(drums, at(b, p + 0.5, beat), hat(rand, { decay: 0.12 }), 0.35);
      for (const q of [0.25, 0.75]) mixInto(drums, at(b, p, beat) + q * beat, hat(rand, { decay: 0.025 }), 0.15);
      mixInto(bass, at(b, p + 0.5, beat), pluckBass(mtof(chord[0] - 24), beat * 0.45, { bright: 2500 }), 0.9);
    }
    for (const p of [1, 3]) mixInto(drums, at(b, p, beat), clap(rand), 0.55);
    if (layers.includes('pad')) for (const m of chord) mixInto(synth, b * 4 * beat, supersaw(rand, mtof(m), beat * 4), 0.18);
    if (layers.includes('stabs')) for (const p of [0.5, 1.75, 2.5, 3.25]) for (const m of chord) mixInto(synth, at(b, p, beat), supersaw(rand, mtof(m + 12), beat * 0.3, { cutoff: 5000 }), 0.12);
    if (layers.includes('arp')) {
      const arp = [...chord, chord[0] + 12].map((m) => m + 12);
      for (let s = 0; s < 16; s++) mixInto(synth, (b * 4 + s / 4) * beat, sawLead(rand, mtof(arp[s % arp.length]), beat * 0.2, { cutoff: 1800, envAmt: 4000 }), 0.16);
    }
  }
  sidechain(synth, kicks);
  sidechain(bass, kicks, { depth: 0.8, release: 0.15 });
  reverb(delay(synth, beat * 0.75), { mix: 0.25 });
  const out = mixBuses(dur, [[drums, 0.8], [synth, 0.8], [bass, 0.8]]);
  return finalize(out, { drive: 1.6 });
}

function rock(rand, dur) {
  const bpm = range(rand, 110, 150), beat = 60 / bpm;
  const key = 40 + Math.floor(rand() * 8), prog = pick(rand, PROGS.rock);
  const style = pick(rand, ['chug', 'strum']);
  const jangle = rand() < 0.6;
  const bars = Math.ceil(dur / (4 * beat));
  const drums = buffer(dur), gtr = buffer(dur), bass = buffer(dur);
  const kickPat = pick(rand, [[0, 2, 2.5], [0, 2.5], [0, 0.5, 2]]);
  for (let b = 0; b < bars; b++) {
    const [deg, q] = prog[b % prog.length];
    const root = chordNotes(key, [deg, q], 52)[0];
    for (const p of kickPat) mixInto(drums, at(b, p, beat), kick({ pitch: 58, decay: 0.3, drive: 2 }), 0.9);
    for (const p of [1, 3]) mixInto(drums, at(b, p, beat), snare(rand, { tone: 200, decay: 0.22, noise: 0.65 }), 0.75);
    for (let p = 0; p < 4; p += 0.5) mixInto(drums, at(b, p, beat), hat(rand, { decay: 0.05 }), 0.22);
    if (b % 4 === 0) mixInto(drums, b * 4 * beat, cymbal(rand, { decay: 1.6, base: 380, noise: 0.7 }), 0.35);

    const power = [root, root + 7, root + 12];
    if (style === 'chug') for (let p = 0; p < 4; p += 0.5) mixInto(gtr, at(b, p, beat), distGuitar(rand, power, beat * 0.45), 0.55);
    else for (const p of [0, 1.5, 2.5]) mixInto(gtr, at(b, p, beat), distGuitar(rand, power, beat * (p === 0 ? 1.4 : 0.9)), 0.55);
    if (jangle) {
      const tones = chordNotes(key, [deg, q], 70);
      for (let s = 0; s < 8; s++) mixInto(gtr, (b * 4 + s / 2) * beat, ksPluck(rand, mtof(tones[s % tones.length]), beat * 0.6, { bright: 0.9 }), 0.22);
    }
    for (let p = 0; p < 4; p += 0.5) mixInto(bass, at(b, p, beat), pluckBass(mtof(root - 12), beat * 0.45, { bright: 900 }), 0.8);
  }
  const out = mixBuses(dur, [[drums, 0.8], [gtr, 0.8], [bass, 0.7]]);
  return finalize(reverb(out, { mix: 0.1, room: 0.6 }), { drive: 1.5 });
}

function classical(rand, dur, title = '') {
  const t = title.toLowerCase();
  const style = t.includes('cello') ? 'cello' : t.includes('harp') ? 'harp'
    : /nocturne|fugue|variations/.test(t) ? 'piano' : t.includes('sonata') ? 'violin-piano' : 'strings';
  const bpm = range(rand, 60, 90), beat = 60 / bpm;
  const minor = rand() < 0.5;
  const key = 48 + Math.floor(rand() * 10);
  const prog = pick(rand, PROGS.classical);
  const bars = Math.ceil(dur / (4 * beat));
  const bed = buffer(dur), voice = buffer(dur);
  const line = melody(rand, { key, scale: minor ? 'minor' : 'major', low: style === 'cello' ? 43 : 67, high: style === 'cello' ? 62 : 86, bars, beat, prog, step: 1, rest: 0.15 });
  for (let b = 0; b < bars; b++) {
    const chord = chordNotes(key, prog[b % prog.length], 64);
    const bassNote = chord[0] - 12;
    if (style === 'piano' || style === 'violin-piano') {
      const broken = [bassNote, chord[0], chord[1] + (chord.length > 3 ? 0 : 12), chord[2]];
      for (let s = 0; s < 8; s++) mixInto(bed, (b * 4 + s / 2) * beat, piano(mtof(broken[s % 4]), beat * 1.5), 0.3);
    } else if (style === 'harp') {
      const up = [...chord, ...chord.map((m) => m + 12)];
      for (let s = 0; s < 16; s++) mixInto(bed, (b * 4 + s / 4) * beat, ksPluck(rand, mtof(up[s % up.length]), beat * 2, { damp: 0.998, bright: 0.6, ring: 1 }), 0.25);
      for (const m of chord) mixInto(bed, b * 4 * beat, strings(rand, mtof(m), beat * 4, { cutoff: 1200 }), 0.08);
    } else if (style === 'cello') {
      mixInto(bed, b * 4 * beat, strings(rand, mtof(bassNote - 12), beat * 4, { cutoff: 900, attack: 0.6 }), 0.15);
    } else {
      for (const m of [bassNote, ...chord]) mixInto(bed, b * 4 * beat, strings(rand, mtof(m), beat * 4, { attack: 0.5, cutoff: 2000 }), 0.16);
    }
  }
  for (const n of line) {
    const f = mtof(n.midi), d = n.dur * 1.4;
    const note = style === 'piano' ? piano(f, d) : style === 'harp' ? ksPluck(rand, f, d, { damp: 0.998, bright: 0.6, ring: 1 })
      : strings(rand, f, d, { attack: 0.12, cutoff: style === 'cello' ? 1400 : 2600, vib: 0.006, voices: 2, detune: 0.002 });
    mixInto(voice, n.t, note, style === 'piano' ? 0.35 : 0.3);
  }
  const out = mixBuses(dur, [[bed, 0.8], [voice, 0.9]]);
  return finalize(reverb(out, { mix: 0.35, room: 0.88, damp: 0.4 }), { drive: 1 });
}

// `vocals`: array of Float32Array spoken lines (24 kHz), one per bar after the intro
function hiphop(rand, dur, vocals = []) {
  const bpm = range(rand, 84, 96), beat = 60 / bpm, swing = range(rand, 0.54, 0.6);
  const key = 45 + Math.floor(rand() * 10), prog = pick(rand, PROGS.hiphop);
  const sample = pick(rand, ['epiano', 'strings', 'piano']);
  const bars = Math.ceil(dur / (4 * beat));
  const drums = buffer(dur), loop = buffer(dur), bass = buffer(dur), vox = buffer(dur);
  const kickPat = pick(rand, [[0, 2.5, 2.75], [0, 0.75, 2.5], [0, 2, 2.5]]);
  const sixteenths = rand() < 0.4;
  for (let b = 0; b < bars; b++) {
    const chord = chordNotes(key, prog[b % prog.length], 64);
    kickPat.forEach((p, i) => {
      mixInto(drums, at(b, p, beat, swing), kick({ pitch: 55, decay: 0.3, drive: 2.2 }), 1);
      const len = ((kickPat[i + 1] ?? 4) - p) * beat;
      mixInto(bass, at(b, p, beat, swing), bass808(mtof(chord[0] - 24), len * 0.95), 0.9);
    });
    for (const p of [1, 3]) mixInto(drums, at(b, p, beat, swing), snare(rand, { tone: 210, decay: 0.2, noise: 0.6 }), 0.8);
    for (let p = 0; p < 4; p += sixteenths ? 0.25 : 0.5) mixInto(drums, at(b, p, beat, swing), hat(rand, { decay: 0.035 }), p % 1 ? 0.15 : 0.25);
    const voice = sample === 'epiano' ? (m, d) => epiano(mtof(m), d) : sample === 'piano' ? (m, d) => piano(mtof(m), d)
      : (m, d) => strings(rand, mtof(m), d, { attack: 0.08, cutoff: 1600 });
    for (const m of chord) mixInto(loop, b * 4 * beat, voice(m, beat * 3.5), 0.18);
    if (b >= 1 && vocals.length) mixInto(vox, b * 4 * beat + 0.05, vocals[(b - 1) % vocals.length], 1);
  }
  highpass(vox, 150);
  const out = mixBuses(dur, [[drums, 0.85], [vinyl(lowpass(loop, 3000), rand, 0.6), 0.7], [bass, 0.8], [vox, 0.75]]);
  return finalize(out, { drive: 1.4 });
}

module.exports = {
  SR, buffer, mixInto, mtof, range, pick, lowpass, highpass, reverb, finalize,
  kick, snare, cymbal, piano, epiano, strings, sawLead, ksPluck, subSine,
  lofi, jazz, electronic, rock, classical, hiphop,
};
