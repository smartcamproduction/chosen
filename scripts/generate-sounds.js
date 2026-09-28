/**
 * Generates the machine's sound effects as small WAV files in assets/sounds/.
 * They are synthesized from scratch (no samples), so there are no licensing
 * questions. Run: npm run sounds
 *
 *  pull.wav  – lever: two ratchet clicks + a soft low thump
 *  tick.wav  – very short, quiet mechanical tick while the reels spin
 *  stop.wav  – a reel locking into place: low "thunk"
 *  win.wav   – calm two-note confirmation (a fifth), not a casino jingle
 */
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const outDir = path.join(process.cwd(), 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

// Deterministic noise so the files are identical every time.
let seed = 42;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return (seed / 4294967296) * 2 - 1;
};

function render(duration, fn) {
  const n = Math.floor(duration * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE);
  return out;
}

/** Soft fade in/out to avoid clicks at the edges, then normalize to a peak. */
function finish(samples, peak) {
  const fade = Math.floor(0.002 * RATE);
  for (let i = 0; i < fade && i < samples.length; i++) {
    samples[i] *= i / fade;
    samples[samples.length - 1 - i] *= i / fade;
  }
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const k = max > 0 ? peak / max : 0;
  return samples.map((s) => s * k);
}

/** One-pole high-pass to make noise bursts sound like crisp clicks. */
function highpass(samples, amount = 0.92) {
  let prevIn = 0;
  let prevOut = 0;
  return samples.map((x) => {
    const y = amount * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    return y;
  });
}

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(outDir, name), Buffer.concat([header, data]));
  console.log(`wrote assets/sounds/${name} (${Math.round((44 + data.length) / 1024)} KB)`);
}

const click = (t, at, decay) => (t >= at ? noise() * Math.exp(-(t - at) / decay) : 0);

// Tick: ~18 ms, crisp and quiet.
writeWav(
  'tick.wav',
  finish(
    highpass(render(0.018, (t) => click(t, 0, 0.0018) + 0.35 * Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t / 0.003))),
    0.35,
  ),
);

// Pull: two ratchet clicks, then a low thump.
writeWav(
  'pull.wav',
  finish(
    render(0.26, (t) => {
      const clicks = 0.6 * (click(t, 0, 0.003) + click(t, 0.055, 0.003));
      const tt = t - 0.1;
      const thump = tt >= 0 ? Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-tt / 0.03)) * tt) * Math.exp(-tt / 0.05) : 0;
      return clicks + thump;
    }),
    0.7,
  ),
);

// Stop: a reel locking in. Pitch-dropping low body + short transient.
writeWav(
  'stop.wav',
  finish(
    render(0.16, (t) => {
      const body = Math.sin(2 * Math.PI * (60 + 110 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.04);
      return body + 0.4 * click(t, 0, 0.002);
    }),
    0.75,
  ),
);

// Win: two soft sine notes a fifth apart (E5 → B5), gentle decay.
writeWav(
  'win.wav',
  finish(
    render(0.75, (t) => {
      const note = (f, at) => {
        const tt = t - at;
        if (tt < 0) return 0;
        const env = Math.min(1, tt / 0.01) * Math.exp(-tt / 0.22);
        return env * (Math.sin(2 * Math.PI * f * tt) + 0.25 * Math.sin(2 * Math.PI * 2 * f * tt));
      };
      return note(659.25, 0) + 0.9 * note(987.77, 0.09);
    }),
    0.45,
  ),
);
