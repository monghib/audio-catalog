// Text-to-speech via the Windows built-in voices (System.Speech). Windows only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { decodeWav, resample } = require('./wav');

const VOICES = { david: 'Microsoft David Desktop', zira: 'Microsoft Zira Desktop' };

// jobs: [{ voice: 'david'|'zira', rate: -10..10, shift: pitch factor, text }] -> Float32Array[] at 24 kHz
function speak(jobs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  try {
    const files = jobs.map((j, i) => ({ voice: VOICES[j.voice], rate: j.rate || 0, text: j.text, out: path.join(dir, `${i}.wav`) }));
    const jobsPath = path.join(dir, 'jobs.json');
    fs.writeFileSync(jobsPath, JSON.stringify(files), 'utf8');
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tts.ps1'), jobsPath], { stdio: 'inherit' });
    return files.map((f, i) => {
      const { samples, sampleRate } = decodeWav(fs.readFileSync(f.out));
      // pitch/speed shift by resampling gives each host a distinct voice
      const shift = jobs[i].shift || 1;
      return resample(samples, sampleRate * shift, 24000);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { speak };
