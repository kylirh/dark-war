/**
 * Synthesize simple placeholder sound effects (Ogg Vorbis) for the new
 * weapons/items/monsters. No npm audio dependency. Re-runnable. Refine/replace
 * with real audio later — these just give each new action an audible cue.
 * Requires ffmpeg.
 *
 *   node tools/gen-sounds.mjs
 *
 * The SoundManager loads these effect keys directly as `.ogg` files.
 */
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  "gyrojet-shotgun-1": render(
    0.35,
    (t) => (rng() * 0.7 + sine(t, 90) * 0.3) * env(t, 0.35, 0.002) * 0.6,
  ),
  // items
  "eat-1": render(
    0.22,
    (t) =>
      (sine(t, 200 + 120 * Math.sin(t * 60)) * 0.6 + rng() * 0.2) *
      env(t, 0.22) *
      0.5,
  ),
  recharge: render(0.4, (t) => sweep(t, 300, 1200, 0.4) * env(t, 0.4) * 0.45),
  "place-wall": render(
    0.2,
    (t) => (sine(t, 140) * 0.7 + rng() * 0.3) * env(t, 0.2, 0.002) * 0.5,
  ),
  // monsters
  "moppet-teleport-1": render(
    0.35,
    (t) =>
      sweep(t, 1200, 400, 0.35) *
      (0.5 + 0.5 * sine(t, 40)) *
      env(t, 0.35) *
      0.4,
  ),
};

let count = 0;
let skipped = 0;
for (const [name, samples] of Object.entries(SOUNDS)) {
  const wavPath = join(OUT_DIR, `${name}.wav.tmp`);
  const oggPath = join(OUT_DIR, `${name}.ogg`);
  // These are fallbacks, not authoritative assets. Never overwrite a sound
  // that has been recorded or supplied by a developer.
  if (existsSync(oggPath)) {
    skipped++;
    continue;
  }
  writeFileSync(wavPath, wav(samples));
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      wavPath,
      "-ac",
      "2",
      "-c:a",
      "vorbis",
      "-strict",
      "experimental",
      "-q:a",
      "5",
      oggPath,
    ],
    { stdio: "inherit" },
  );
  unlinkSync(wavPath);
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed while encoding ${name}.ogg`);
  }
  count++;
}
console.log(`✓ sounds: wrote ${count}, preserved ${skipped} existing OGGs`);
