/**
 * Synthesize simple placeholder sound effects (16-bit PCM mono WAV) for the new
 * weapons/items/monsters. Dependency-free. Re-runnable. Refine/replace with real
 * audio later — these just give each new action an audible cue.
 *
 *   node tools/gen-sounds.mjs
 *
 * The SoundManager maps these effect keys to `.wav` via SOUND_FILES overrides.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "app", "assets", "sounds");
mkdirSync(OUT_DIR, { recursive: true });

const RATE = 22050;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

const rng = (() => {
  let s = 1337;
  return () =>
    ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
})();

// render(duration, fn(t, i) -> sample in [-1,1])
function render(dur, fn) {
  const n = Math.floor(dur * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i) || 0;
  return out;
}

const env = (t, dur, attack = 0.005) =>
  Math.min(1, t / attack) * Math.max(0, 1 - (t - attack) / (dur - attack));
const sine = (t, f) => Math.sin(2 * Math.PI * f * t);
const sweep = (t, f0, f1, dur) => sine(t, f0 + (f1 - f0) * (t / dur));

const SOUNDS = {
  // weapons
  "laser-shoot": render(
    0.28,
    (t) => sweep(t, 1400, 320, 0.28) * env(t, 0.28) * 0.5,
  ),
  "shotgun-blast": render(
    0.35,
    (t) => (rng() * 0.7 + sine(t, 90) * 0.3) * env(t, 0.35, 0.002) * 0.6,
  ),
  "smg-shoot": render(
    0.08,
    (t) => (sine(t, 520) * 0.6 + rng() * 0.4) * env(t, 0.08, 0.002) * 0.45,
  ),
  "throw-rock": render(
    0.18,
    (t) => sweep(t, 600, 200, 0.18) * env(t, 0.18) * 0.4,
  ),
  // items
  pickup: render(
    0.18,
    (t) => (sine(t, 880) + sine(t, 1320) * 0.5) * env(t, 0.18) * 0.4,
  ),
  eat: render(
    0.22,
    (t) =>
      (sine(t, 200 + 120 * Math.sin(t * 60)) * 0.6 + rng() * 0.2) *
      env(t, 0.22) *
      0.5,
  ),
  powerup: render(0.4, (t) => sweep(t, 300, 1200, 0.4) * env(t, 0.4) * 0.45),
  warp: render(
    0.6,
    (t) =>
      (sweep(t, 200, 1600, 0.3) + sweep(t, 1600, 200, 0.6)) * env(t, 0.6) * 0.4,
  ),
  "place-wall": render(
    0.2,
    (t) => (sine(t, 140) * 0.7 + rng() * 0.3) * env(t, 0.2, 0.002) * 0.5,
  ),
  coins: render(
    0.3,
    (t) => (sine(t, 1000) + sine(t, 1500) * 0.6) * env(t % 0.1, 0.1) * 0.35,
  ),
  // monsters
  bark: render(
    0.22,
    (t) =>
      (sine(t, 260 - 200 * t) * 0.7 + rng() * 0.3) * env(t, 0.22, 0.003) * 0.5,
  ),
  hiss: render(0.4, (t) => rng() * (1 - t) * env(t, 0.4, 0.02) * 0.4),
  "alien-zap": render(
    0.3,
    (t) =>
      sweep(t, 700, 1500, 0.3) * Math.sign(sine(t, 30)) * env(t, 0.3) * 0.4,
  ),
  squelch: render(
    0.3,
    (t) => sine(t, 120 + 80 * Math.sin(t * 25)) * env(t, 0.3) * 0.5,
  ),
  teleport: render(
    0.35,
    (t) =>
      sweep(t, 1200, 400, 0.35) *
      (0.5 + 0.5 * sine(t, 40)) *
      env(t, 0.35) *
      0.4,
  ),
};

let count = 0;
for (const [name, samples] of Object.entries(SOUNDS)) {
  writeFileSync(join(OUT_DIR, `${name}.wav`), wav(samples));
  count++;
}
console.log(`✓ sounds: wrote ${count} WAVs -> ${OUT_DIR}`);
