/**
 * Remove a flat chroma-key background from an RGBA PNG without dependencies.
 *
 * Usage:
 *   node tools/remove-chroma.mjs input.png output.png ff00ff
 */

import { readFileSync, writeFileSync } from "node:fs";
import { decodePNG, encodePNG } from "./png.mjs";

const [, , inputPath, outputPath, keyHex = "ff00ff"] = process.argv;
if (!inputPath || !outputPath || !/^[0-9a-f]{6}$/i.test(keyHex)) {
  throw new Error(
    "Usage: node tools/remove-chroma.mjs input.png output.png rrggbb",
  );
}

const key = [
  Number.parseInt(keyHex.slice(0, 2), 16),
  Number.parseInt(keyHex.slice(2, 4), 16),
  Number.parseInt(keyHex.slice(4, 6), 16),
];
const image = decodePNG(readFileSync(inputPath));
const removed = new Uint8Array(image.width * image.height);
const queue = [];

function looksLikeKey(pixelIndex) {
  const offset = pixelIndex * 4;
  const red = image.data[offset];
  const green = image.data[offset + 1];
  const blue = image.data[offset + 2];
  if (key[0] > 200 && key[1] < 80 && key[2] > 200) {
    return (
      red > 130 &&
      blue > 120 &&
      green < 110 &&
      Math.abs(red - blue) < 75 &&
      Math.min(red, blue) - green > 75
    );
  }
  const redDelta = red - key[0];
  const greenDelta = green - key[1];
  const blueDelta = blue - key[2];
  return (
    redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta <
    80 * 80
  );
}

function enqueue(x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const pixelIndex = x + y * image.width;
  if (removed[pixelIndex] || !looksLikeKey(pixelIndex)) return;
  removed[pixelIndex] = 1;
  queue.push(pixelIndex);
}

for (let x = 0; x < image.width; x++) {
  enqueue(x, 0);
  enqueue(x, image.height - 1);
}
for (let y = 0; y < image.height; y++) {
  enqueue(0, y);
  enqueue(image.width - 1, y);
}

for (let cursor = 0; cursor < queue.length; cursor++) {
  const pixelIndex = queue[cursor];
  const x = pixelIndex % image.width;
  const y = Math.floor(pixelIndex / image.width);
  enqueue(x - 1, y);
  enqueue(x + 1, y);
  enqueue(x, y - 1);
  enqueue(x, y + 1);
}

for (let pixelIndex = 0; pixelIndex < removed.length; pixelIndex++) {
  if (!removed[pixelIndex]) continue;
  image.data[pixelIndex * 4 + 3] = 0;
}

writeFileSync(outputPath, encodePNG(image.width, image.height, image.data));
