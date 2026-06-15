/**
 * Generate Dark War's pixel-art sprite atlas.
 *
 * The atlas keeps the original 32px grid, but frames may span multiple cells.
 * Source rectangles must match src/engine/config/sprites.ts. Gameplay remains on a
 * 32x32 tile footprint; visual height comes from the frame metadata.
 *
 *   node tools/gen-spritesheet.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePNG, encodePNG } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, "sprites.base.png");
const REFERENCE = join(HERE, "sprites.reference.png");
const OUT = join(HERE, "..", "app", "assets", "img", "sprites.png");

const TILE = 32;
const COLS = 16;
const OUT_ROWS = 43;
const base = decodePNG(readFileSync(BASE));
const reference = decodePNG(readFileSync(REFERENCE));
const W = COLS * TILE;
const H = OUT_ROWS * TILE;
const data = new Uint8Array(W * H * 4);
data.set(base.data.subarray(0, Math.min(base.data.length, data.length)), 0);
const frameOwners = new Map();
const referenceSprites = {
  "bone.png": { col: 9, row: 5 },
  "butcher-knife.png": { col: 0, row: 5 },
  "cookie.png": { col: 10, row: 5 },
  "dog.png": { col: 1, row: 7 },
  "dreadnaut.png": { col: 10, row: 12, cellsW: 2, cellsH: 2, preScaled: true },
  "flutterbang.png": { col: 4, row: 7 },
  "gyrojot-rifle.png": { col: 0, row: 3 },
  "gyrojot-shotgun.png": { col: 3, row: 5 },
  "gyrojot-smg.png": { col: 2, row: 5 },
  "icky-lump.png": { col: 2, row: 7 },
  "laser-gun.png": { col: 1, row: 5 },
  "macrometal-armor.png": { col: 6, row: 5 },
  "moppet.png": { col: 5, row: 7 },
  "panic-button.png": { col: 7, row: 5 },
  "powercell.png": { col: 8, row: 3 },
  "snagglepuss.png": { col: 3, row: 7 },
  "spider.png": { col: 0, row: 7 },
  "tentacular-horror.png": {
    col: 8,
    row: 12,
    cellsW: 2,
    cellsH: 2,
    preScaled: true,
  },
  "terrorist-collaborator.png": { col: 9, row: 7 },
  "utility-bot.png": { col: 10, row: 2 },
  "vending-machine.png": { col: 1, row: 6 },
  "zyth.png": { col: 7, row: 7 },
};

const C = {
  ink: [15, 17, 22],
  ink2: [27, 31, 40],
  steel0: [58, 64, 78],
  steel1: [112, 124, 144],
  steel2: [184, 196, 210],
  white: [238, 240, 232],
  concrete0: [58, 61, 67],
  concrete1: [92, 98, 108],
  concrete2: [134, 142, 152],
  rust: [154, 74, 42],
  wood0: [72, 47, 31],
  wood1: [118, 77, 43],
  wood2: [171, 118, 66],
  grass0: [24, 51, 29],
  grass1: [45, 104, 46],
  grass2: [88, 161, 71],
  grass3: [139, 203, 91],
  weed0: [37, 61, 31],
  weed1: [84, 125, 52],
  road0: [26, 29, 34],
  road1: [48, 53, 62],
  road2: [82, 86, 91],
  sidewalk0: [76, 80, 80],
  sidewalk1: [128, 132, 124],
  tan0: [104, 76, 48],
  tan1: [177, 135, 82],
  tan2: [228, 184, 113],
  gold0: [158, 111, 28],
  gold1: [234, 184, 55],
  gold2: [255, 227, 105],
  red0: [92, 25, 27],
  red1: [181, 42, 44],
  red2: [245, 83, 67],
  blue0: [26, 47, 88],
  blue1: [50, 96, 180],
  blue2: [100, 203, 255],
  cyan0: [26, 109, 128],
  cyan1: [68, 224, 236],
  cyan2: [190, 255, 250],
  purple0: [58, 34, 92],
  purple1: [130, 70, 185],
  purple2: [207, 112, 238],
  green0: [24, 77, 52],
  green1: [52, 166, 84],
  green2: [119, 226, 108],
  yellow0: [162, 94, 22],
  yellow1: [238, 169, 45],
  yellow2: [255, 224, 79],
  black: [5, 6, 8],
};

function blend(dst, src) {
  const [r, g, b, a = 255] = src;
  const sa = a / 255;
  const da = dst[3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return [0, 0, 0, 0];
  return [
    Math.round((r * sa + dst[0] * da * (1 - sa)) / oa),
    Math.round((g * sa + dst[1] * da * (1 - sa)) / oa),
    Math.round((b * sa + dst[2] * da * (1 - sa)) / oa),
    Math.round(oa * 255),
  ];
}

function frame(col, row, cellsW = 1, cellsH = 1) {
  const owner = `${col},${row},${cellsW},${cellsH}`;
  let firstUse = true;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const cellKey = `${col + cx},${row + cy}`;
      const existing = frameOwners.get(cellKey);
      if (existing && existing !== owner) {
        throw new Error(
          `Sprite atlas overlap at cell ${cellKey}: ${owner} conflicts with ${existing}`,
        );
      }
      if (existing === owner) firstUse = false;
      frameOwners.set(cellKey, owner);
    }
  }

  const ox = col * TILE;
  const oy = row * TILE;
  const fw = cellsW * TILE;
  const fh = cellsH * TILE;
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const i = ((oy + y) * W + (ox + x)) * 4;
    const out = blend(data.subarray(i, i + 4), color);
    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
    data[i + 3] = out[3];
  };
  const clear = () => {
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = ((oy + y) * W + (ox + x)) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  };
  const rect = (x, y, w, h, color) => {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, color);
    }
  };
  const outlineRect = (x, y, w, h, fill, stroke = C.ink) => {
    rect(x, y, w, h, stroke);
    rect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2), fill);
  };
  const ellipse = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(x, y, color);
      }
    }
  };
  const disc = (cx, cy, r, color) => ellipse(cx, cy, r, r, color);
  const line = (x0, y0, x1, y1, color) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      put(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  };
  const thickLine = (x0, y0, x1, y1, color, r = 1) => {
    line(x0, y0, x1, y1, color);
    for (let o = 1; o <= r; o++) {
      line(x0 + o, y0, x1 + o, y1, color);
      line(x0 - o, y0, x1 - o, y1, color);
      line(x0, y0 + o, x1, y1 + o, color);
      line(x0, y0 - o, x1, y1 - o, color);
    }
  };
  const noise = (colors, density = 0.2, seed = 1) => {
    let s = seed;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        if ((s & 255) / 255 < density) put(x, y, colors[s % colors.length]);
      }
    }
  };
  if (firstUse) clear();
  return {
    put,
    clear,
    rect,
    outlineRect,
    ellipse,
    disc,
    line,
    thickLine,
    noise,
    fw,
    fh,
  };
}

function tile(col, row, base, accent, seed) {
  const c = frame(col, row);
  c.rect(0, 0, 32, 32, base);
  c.noise([accent, [base[0] - 8, base[1] - 8, base[2] - 8]], 0.14, seed);
  return c;
}

function drawReferenceSprite(col, row, filename, options = {}) {
  const cellsW = options.cellsW ?? 1;
  const cellsH = options.cellsH ?? 1;
  const c = frame(col, row, cellsW, cellsH);
  c.clear();

  const sourceFrame = referenceSprites[filename];
  if (!sourceFrame) {
    throw new Error(`Unknown reference sprite: ${filename}`);
  }
  const source = reference;
  const sourceStartX = sourceFrame.col * TILE;
  const sourceStartY = sourceFrame.row * TILE;
  const sourceEndX = sourceStartX + (sourceFrame.cellsW ?? 1) * TILE;
  const sourceEndY = sourceStartY + (sourceFrame.cellsH ?? 1) * TILE;
  const isVisible = (i) => {
    const a = source.data[i + 3];
    if (a <= 24) return false;
    const r = source.data[i];
    const g = source.data[i + 1];
    const b = source.data[i + 2];
    return !(r >= 245 && g >= 245 && b >= 245);
  };

  let minX = sourceEndX;
  let minY = sourceEndY;
  let maxX = -1;
  let maxY = -1;
  for (let y = sourceStartY; y < sourceEndY; y++) {
    for (let x = sourceStartX; x < sourceEndX; x++) {
      const i = (y * source.width + x) * 4;
      if (!isVisible(i)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return;

  const spriteW = maxX - minX + 1;
  const spriteH = maxY - minY + 1;
  const targetW = cellsW * TILE;
  const targetH = cellsH * TILE;
  const scale = sourceFrame.preScaled ? 1 : (options.scale ?? 1);
  const drawW = Math.max(1, Math.round(spriteW * scale));
  const drawH = Math.max(1, Math.round(spriteH * scale));
  const baseX =
    options.x ??
    Math.floor((targetW - drawW) / 2) + Math.round(options.offsetX ?? 0);
  const baseY =
    options.y ??
    Math.floor((targetH - drawH) / 2) + Math.round(options.offsetY ?? 0);

  for (let ty = 0; ty < drawH; ty++) {
    for (let tx = 0; tx < drawW; tx++) {
      const sx = minX + Math.floor(tx / scale);
      const sy = minY + Math.floor(ty / scale);
      if (sx < minX || sy < minY || sx > maxX || sy > maxY) continue;
      const i = (sy * source.width + sx) * 4;
      if (!isVisible(i)) continue;
      c.put(baseX + tx, baseY + ty, [
        source.data[i],
        source.data[i + 1],
        source.data[i + 2],
        source.data[i + 3],
      ]);
    }
  }
}

function drawBaseSprite(col, row, sourceCol, sourceRow, options = {}) {
  const cellsW = options.cellsW ?? 1;
  const cellsH = options.cellsH ?? 1;
  const c = frame(col, row, cellsW, cellsH);
  if (options.clear !== false) c.clear();

  const sourceX = sourceCol * TILE;
  const sourceY = sourceRow * TILE;
  const sourceW = (options.sourceCellsW ?? 1) * TILE;
  const sourceH = (options.sourceCellsH ?? 1) * TILE;
  const scale = options.scale ?? 1;
  const drawW = Math.max(1, Math.round(sourceW * scale));
  const drawH = Math.max(1, Math.round(sourceH * scale));
  const targetW = cellsW * TILE;
  const targetH = cellsH * TILE;
  const baseX =
    options.x ??
    Math.floor((targetW - drawW) / 2) + Math.round(options.offsetX ?? 0);
  const baseY =
    options.y ??
    Math.floor((targetH - drawH) / 2) + Math.round(options.offsetY ?? 0);

  for (let ty = 0; ty < drawH; ty++) {
    for (let tx = 0; tx < drawW; tx++) {
      const sx = sourceX + Math.floor(tx / scale);
      const sy = sourceY + Math.floor(ty / scale);
      if (sx < 0 || sy < 0 || sx >= base.width || sy >= base.height) continue;
      const i = (sy * base.width + sx) * 4;
      const a = base.data[i + 3];
      if (a <= 24) continue;
      c.put(baseX + tx, baseY + ty, [
        base.data[i],
        base.data[i + 1],
        base.data[i + 2],
        a,
      ]);
    }
  }
}

function restoreBaseRows() {
  for (let row = 0; row < Math.floor(base.height / TILE); row++) {
    for (let col = 0; col < COLS; col++) {
      drawBaseSprite(col, row, col, row);
    }
  }
}

// ----- terrain ----------------------------------------------------------------
tile(1, 0, [34, 36, 40], [55, 58, 64], 2); // dungeon floor
tile(8, 0, [38, 39, 43], [62, 64, 70], 8);
tile(9, 0, [31, 33, 37], [50, 54, 60], 9);
tile(13, 0, [44, 39, 36], [117, 87, 62], 13).rect(
  5,
  7,
  22,
  18,
  [80, 55, 42, 160],
);
tile(14, 0, [13, 15, 19], [32, 37, 44], 14).ellipse(
  16,
  16,
  11,
  8,
  [4, 5, 7, 230],
);
tile(0, 4, C.road0, C.road1, 40).rect(0, 14, 32, 2, C.road2);
tile(1, 4, C.sidewalk0, C.sidewalk1, 41).rect(0, 15, 32, 1, [91, 95, 91]);
tile(2, 4, C.grass0, C.grass1, 42).noise([C.grass2, C.grass3], 0.08, 43);
tile(3, 4, C.weed0, C.weed1, 44).noise([C.grass2, C.grass3], 0.16, 45);
tile(4, 4, [74, 64, 45], [119, 100, 66], 46).rect(0, 15, 32, 2, [97, 82, 55]);
tile(8, 4, [65, 58, 53], [114, 103, 91], 47);
const crackedRoad = tile(9, 9, C.road0, C.road1, 111);
crackedRoad.line(4, 19, 13, 13, C.ink);
crackedRoad.line(13, 13, 19, 17, C.ink);
crackedRoad.line(19, 17, 29, 10, C.ink);
crackedRoad.rect(0, 14, 32, 2, C.road2);
const crackedSidewalk = tile(10, 9, C.sidewalk0, C.sidewalk1, 112);
crackedSidewalk.line(3, 9, 13, 17, [40, 43, 43]);
crackedSidewalk.line(13, 17, 24, 14, [40, 43, 43]);
crackedSidewalk.line(16, 0, 16, 32, [91, 95, 91]);
crackedSidewalk.line(0, 16, 32, 16, [91, 95, 91]);
const flowers = tile(11, 9, C.grass0, C.grass1, 113);
flowers.noise([C.grass2, C.grass3], 0.1, 114);
for (const [x, y, color] of [
  [7, 11, C.yellow2],
  [18, 8, C.purple2],
  [24, 19, C.red2],
  [12, 23, C.cyan2],
]) {
  flowers.disc(x, y, 1, color);
}
const denseWeeds = tile(12, 9, C.weed0, C.weed1, 115);
for (let x = 1; x < 32; x += 2)
  denseWeeds.line(x, 31, x + ((x % 5) - 2), 5 + (x % 17), C.grass2);
const blood = frame(15, 9);
blood.ellipse(17, 18, 10, 5, [106, 18, 20, 150]);
blood.disc(8, 21, 2, [106, 18, 20, 130]);
blood.disc(25, 15, 2, [106, 18, 20, 120]);

function tallWall(col, row, fill, mid, hi, crack = 0) {
  const c = frame(col, row, 1, 2);
  c.outlineRect(1, 12, 30, 50, fill);
  c.rect(3, 14, 26, 10, hi);
  c.rect(3, 25, 26, 34, mid);
  c.rect(3, 58, 26, 3, [28, 30, 35]);
  for (let y = 28; y < 58; y += 9) c.line(3, y, 28, y, [38, 40, 47]);
  for (let x = 8; x < 28; x += 9) c.line(x, 24, x - 2, 60, [42, 44, 50]);
  if (crack > 0) {
    c.thickLine(21, 23, 15, 38, C.ink, 1);
    c.line(15, 38, 22, 48, C.ink);
  }
  if (crack > 1) {
    c.rect(5, 47, 10, 12, [30, 31, 35]);
    c.line(18, 30, 27, 39, C.ink);
  }
}
tallWall(0, 8, C.concrete0, C.concrete1, C.concrete2, 0);
tallWall(1, 8, C.wood0, C.wood1, C.wood2, 0);
tallWall(2, 8, C.concrete0, C.concrete1, C.concrete2, 1);
tallWall(3, 8, C.concrete0, C.concrete1, C.concrete2, 2);
tallWall(4, 8, C.wood0, C.wood1, C.wood2, 1);
tallWall(5, 8, C.wood0, C.wood1, C.wood2, 2);
function door(col, row, locked = false, open = false) {
  const c = frame(col, row, 1, 2);
  c.outlineRect(4, 16, 24, 46, open ? [38, 30, 24] : C.wood1);
  if (!open) {
    c.rect(7, 20, 18, 34, C.wood0);
    c.rect(13, 20, 2, 34, C.wood2);
    c.disc(23, 39, 2, locked ? C.red2 : C.gold1);
    if (locked) c.rect(18, 30, 8, 8, C.steel2);
  }
}
door(6, 8, false, false);
door(7, 8, false, true);
door(8, 8, true, false);
frame(4, 0).rect(8, 8, 16, 18, C.green1);
frame(5, 0).rect(8, 6, 16, 20, C.green2);

const grassBlades = frame(9, 8);
for (let x = 2; x < 31; x += 3)
  grassBlades.line(x, 31, x + (x % 2 ? 3 : -2), 12 + (x % 7), C.grass2);
grassBlades.noise([C.grass3], 0.05, 90);
const weedBlades = frame(10, 8);
for (let x = 1; x < 32; x += 2)
  weedBlades.line(x, 31, x + ((x % 3) - 1) * 4, 8 + (x % 13), C.weed1);
weedBlades.noise([C.grass2, C.grass3], 0.08, 91);

const tree = frame(0, 10, 2, 3);
tree.ellipse(32, 38, 27, 25, [18, 61, 32]);
tree.ellipse(21, 32, 17, 16, C.green0);
tree.ellipse(42, 26, 18, 17, C.green1);
tree.ellipse(46, 45, 18, 17, C.grass1);
tree.ellipse(24, 48, 19, 15, C.grass1);
tree.rect(28, 55, 8, 34, C.wood0);
tree.rect(32, 57, 3, 30, C.wood2);
tree.thickLine(31, 65, 16, 91, C.wood0, 2);
tree.thickLine(34, 65, 48, 91, C.wood0, 2);
tree.noise([C.grass2, C.grass3], 0.05, 100);

const building = frame(2, 10, 1, 2);
building.outlineRect(1, 8, 30, 54, [57, 65, 82]);
building.rect(3, 10, 26, 10, [87, 101, 126]);
building.rect(6, 27, 7, 9, [38, 62, 94]);
building.rect(19, 27, 7, 9, [38, 62, 94]);
building.rect(8, 45, 16, 17, [32, 35, 43]);
building.rect(14, 45, 2, 17, [93, 102, 122]);
const roof = tile(5, 10, [38, 43, 56], [63, 71, 89], 120);
roof.rect(0, 0, 32, 4, [84, 95, 118]);
roof.rect(4, 8, 10, 8, [29, 34, 46]);
roof.rect(19, 17, 8, 6, [29, 34, 46]);

const fence = frame(3, 10, 1, 2);
for (let x = 4; x <= 26; x += 7) fence.outlineRect(x, 28, 4, 34, C.steel1);
fence.rect(2, 38, 28, 5, C.steel0);
fence.rect(2, 51, 28, 5, C.steel0);
fence.noise([C.rust], 0.08, 102);
const fenceH = frame(6, 10, 1, 2);
for (let x = 4; x <= 26; x += 8) fenceH.outlineRect(x, 30, 4, 30, C.steel1);
fenceH.rect(2, 42, 28, 5, C.steel0);
fenceH.rect(2, 53, 28, 5, C.steel0);
fenceH.noise([C.rust], 0.06, 122);
const fenceV = frame(7, 10, 1, 2);
fenceV.outlineRect(13, 14, 5, 48, C.steel1);
fenceV.rect(6, 22, 20, 4, C.steel0);
fenceV.rect(6, 38, 20, 4, C.steel0);
fenceV.rect(6, 54, 20, 4, C.steel0);
fenceV.noise([C.rust], 0.06, 123);

const entrance = frame(4, 10, 1, 2);
entrance.outlineRect(1, 9, 30, 53, [43, 57, 92]);
entrance.rect(3, 11, 26, 10, C.blue1);
entrance.rect(6, 24, 20, 6, C.blue2);
entrance.rect(9, 37, 14, 25, [17, 24, 42]);
entrance.rect(12, 41, 8, 21, [28, 41, 76]);
entrance.put(23, 48, C.gold2);
const streetlight = frame(8, 10, 1, 2);
streetlight.rect(15, 15, 3, 45, C.steel0);
streetlight.rect(11, 14, 12, 3, C.steel1);
streetlight.disc(16, 12, 5, C.gold2);
streetlight.disc(16, 12, 7, [255, 224, 79, 70]);
const terminal = frame(9, 10);
terminal.outlineRect(8, 10, 16, 16, C.steel0);
terminal.rect(10, 12, 12, 7, [30, 92, 116]);
terminal.rect(12, 21, 2, 2, C.cyan2);
terminal.rect(17, 21, 2, 2, C.green2);
const crate = frame(10, 10);
crate.outlineRect(7, 12, 18, 14, C.wood1);
crate.line(8, 13, 24, 25, C.wood2);
crate.line(24, 13, 8, 25, C.wood2);
const barrel = frame(11, 10);
barrel.outlineRect(10, 9, 12, 19, C.steel0);
barrel.rect(11, 12, 10, 3, C.rust);
barrel.rect(11, 22, 10, 3, C.rust);

// ----- player, legacy monsters, and effects ----------------------------------
function humanoid(col, row, shirt, pants, skin = C.tan2, accent = C.blue2) {
  const c = frame(col, row);
  c.disc(16, 7, 4, skin);
  c.rect(11, 11, 10, 11, shirt);
  c.rect(9, 13, 4, 10, shirt);
  c.rect(20, 13, 4, 10, shirt);
  c.rect(11, 22, 4, 8, pants);
  c.rect(17, 22, 4, 8, pants);
  c.rect(13, 6, 2, 1, C.ink);
  c.rect(18, 6, 2, 1, C.ink);
  c.rect(21, 15, 7, 2, accent);
}
humanoid(0, 1, [43, 118, 118], [41, 53, 74]);
frame(1, 1).ellipse(16, 21, 11, 5, [84, 31, 31]);
humanoid(2, 1, [43, 118, 118], [41, 53, 74]);
humanoid(3, 1, [51, 139, 131], [41, 53, 74]);
humanoid(4, 1, [43, 118, 118], [41, 53, 74]);
humanoid(5, 1, [51, 139, 131], [41, 53, 74]);
humanoid(6, 1, [43, 118, 118], [41, 53, 74]);
humanoid(7, 1, [51, 139, 131], [41, 53, 74]);

const mutant = frame(0, 2);
mutant.disc(16, 8, 5, [91, 182, 90]);
mutant.rect(10, 13, 12, 12, [74, 128, 72]);
mutant.rect(8, 16, 5, 10, [74, 128, 72]);
mutant.rect(20, 16, 5, 10, [74, 128, 72]);
mutant.rect(11, 25, 4, 6, C.wood0);
mutant.rect(18, 25, 4, 6, C.wood0);
mutant.put(14, 8, C.red2);
mutant.put(18, 8, C.red2);
const rat = frame(1, 2);
rat.ellipse(16, 21, 11, 6, [88, 48, 45]);
rat.ellipse(24, 16, 5, 5, [105, 59, 54]);
rat.line(6, 22, 1, 19, [160, 95, 83]);
rat.put(25, 15, C.red2);
frame(2, 2).thickLine(4, 16, 27, 16, C.gold2, 1);
for (let i = 0; i < 3; i++) {
  const e = frame(3 + i, 2);
  e.disc(16, 16, 6 + i * 4, [248, 178 - i * 30, 48, 220 - i * 35]);
  e.noise([[255, 240, 110], C.red2], 0.25, 50 + i);
}
humanoid(6, 2, [69, 128, 74], [53, 61, 44], [111, 196, 89]);
humanoid(7, 2, [79, 150, 83], [53, 61, 44], [111, 196, 89]);
frame(8, 2).ellipse(16, 21, 11, 6, [92, 54, 50]);
frame(9, 2).ellipse(16, 21, 11, 6, [110, 63, 54]);

// ----- base items -------------------------------------------------------------
function gun(col, row, body, barrel = C.steel2, grip = C.wood0) {
  const c = frame(col, row);
  c.outlineRect(5, 13, 17, 6, body);
  c.rect(20, 14, 8, 3, barrel);
  c.rect(8, 18, 5, 9, grip);
  c.rect(13, 17, 4, 3, C.ink2);
}
gun(0, 3, C.blue1, C.steel2);
frame(1, 3).rect(8, 12, 16, 8, C.gold1);
frame(1, 3).rect(11, 10, 10, 12, C.gold2);
frame(2, 3).outlineRect(8, 8, 16, 18, C.white);
frame(2, 3).rect(13, 10, 6, 14, C.red2);
frame(2, 3).rect(9, 14, 14, 6, C.red2);
frame(3, 3).outlineRect(9, 8, 14, 18, C.gold1);
frame(3, 3).rect(13, 14, 6, 2, C.ink);
frame(4, 3).disc(16, 16, 8, C.green0);
frame(4, 3).rect(15, 6, 2, 8, C.steel2);
frame(5, 3).rect(8, 18, 16, 5, C.steel0);
frame(5, 3).rect(13, 12, 6, 7, C.red1);
frame(6, 3).rect(7, 19, 18, 4, C.red2);
frame(7, 3).outlineRect(9, 7, 14, 19, C.purple1);
frame(7, 3).rect(13, 11, 6, 11, C.cyan1);
frame(8, 3).outlineRect(10, 7, 12, 18, C.cyan0);
frame(8, 3).rect(13, 10, 6, 12, C.cyan2);

// ----- new items --------------------------------------------------------------
const knife = frame(0, 5);
knife.thickLine(8, 25, 24, 7, C.ink, 1);
knife.thickLine(10, 23, 24, 7, C.steel2, 1);
knife.rect(7, 24, 6, 4, C.wood1);
knife.put(23, 8, C.white);
gun(1, 5, C.purple1, C.cyan2, C.ink2);
gun(2, 5, C.steel0, C.steel2, C.ink2);
frame(2, 5).rect(21, 10, 4, 10, C.steel1);
gun(3, 5, C.steel1, C.steel2, C.wood1);
frame(3, 5).rect(24, 13, 4, 5, C.ink);
const sword = frame(4, 5);
sword.thickLine(16, 4, 16, 23, C.steel2, 1);
sword.line(15, 4, 14, 11, C.white);
sword.rect(10, 22, 13, 3, C.steel0);
sword.rect(15, 24, 3, 6, C.wood1);
const vibra = frame(5, 5);
vibra.thickLine(16, 4, 16, 23, C.cyan1, 1);
vibra.line(14, 4, 12, 23, [120, 255, 255, 120]);
vibra.rect(10, 22, 13, 3, C.steel2);
vibra.rect(15, 24, 3, 6, C.ink2);
const armor = frame(6, 5);
armor.outlineRect(10, 7, 12, 18, [74, 96, 126]);
armor.rect(7, 10, 5, 10, [58, 78, 106]);
armor.rect(20, 10, 5, 10, [58, 78, 106]);
armor.rect(15, 8, 2, 17, C.steel2);
armor.rect(11, 13, 10, 2, C.blue2);
const panic = frame(7, 5);
panic.outlineRect(6, 13, 20, 12, C.steel0);
panic.disc(16, 18, 6, C.red2);
panic.disc(14, 16, 2, [255, 170, 150]);
const holo = frame(8, 5);
holo.rect(4, 5, 24, 22, [58, 221, 238, 70]);
for (let y = 7; y < 27; y += 5) holo.line(5, y, 27, y, [156, 255, 255, 150]);
for (let x = 8; x < 28; x += 6) holo.line(x, 6, x, 27, [156, 255, 255, 130]);
const bone = frame(9, 5);
bone.thickLine(9, 13, 23, 21, C.white, 1);
bone.disc(8, 12, 3, C.white);
bone.disc(10, 15, 3, C.white);
bone.disc(22, 20, 3, C.white);
bone.disc(24, 23, 3, C.white);
const cookie = frame(10, 5);
cookie.disc(16, 17, 9, C.tan2);
cookie.disc(16, 17, 9, [175, 112, 62, 80]);
for (const [x, y] of [
  [12, 14],
  [18, 12],
  [20, 18],
  [14, 21],
  [10, 18],
])
  cookie.disc(x, y, 1, C.wood0);
const pill = frame(11, 5);
pill.ellipse(16, 16, 9, 5, C.black);
pill.ellipse(19, 15, 4, 2, [60, 60, 70]);
const coin = frame(12, 5);
coin.disc(16, 16, 7, C.gold1);
coin.disc(16, 16, 5, C.gold2);
coin.rect(15, 11, 2, 10, C.gold0);
const rock = frame(13, 5);
rock.ellipse(16, 19, 9, 6, [95, 99, 104]);
rock.ellipse(19, 16, 5, 3, [138, 143, 148]);
const rubble = frame(14, 5);
rubble.rect(6, 20, 7, 5, [107, 100, 91]);
rubble.rect(14, 17, 7, 8, [139, 129, 118]);
rubble.rect(21, 22, 5, 4, [83, 80, 77]);
const trash = frame(15, 5);
trash.ellipse(16, 19, 10, 6, [69, 92, 68]);
trash.rect(10, 13, 9, 6, [147, 132, 84]);
trash.line(8, 22, 23, 14, [48, 53, 45]);
const scraps = frame(0, 6);
scraps.thickLine(8, 23, 19, 11, C.steel1, 1);
scraps.line(14, 21, 25, 21, C.steel2);
scraps.rect(18, 13, 5, 4, C.rust);
const vending = frame(1, 6);
vending.outlineRect(8, 3, 17, 26, C.red1);
vending.rect(11, 6, 8, 12, [31, 48, 80]);
vending.rect(20, 7, 2, 3, C.gold2);
vending.rect(20, 13, 2, 3, C.gold2);
vending.rect(11, 23, 10, 3, C.ink);
frame(2, 6).thickLine(5, 16, 27, 16, C.cyan1, 1);

// ----- utility bot and new monsters ------------------------------------------
function bot(col, row) {
  const c = frame(col, row);
  c.outlineRect(9, 8, 14, 17, C.steel1);
  c.rect(11, 11, 10, 5, C.blue2);
  c.rect(6, 23, 20, 4, C.steel0);
  c.rect(7, 27, 6, 2, C.ink);
  c.rect(19, 27, 6, 2, C.ink);
  c.put(14, 13, C.ink);
  c.put(18, 13, C.ink);
}
bot(10, 2);
bot(11, 2);
bot(12, 2);

const spider = frame(0, 7);
spider.ellipse(16, 18, 9, 6, [34, 27, 43]);
spider.ellipse(17, 12, 6, 5, [45, 34, 57]);
for (const s of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    spider.thickLine(14 + s * 2, 17, 4 + s * (i * 3), 8 + i * 6, C.ink, 1);
  }
}
spider.put(15, 11, C.red2);
spider.put(19, 11, C.red2);
const dog = frame(1, 7);
dog.rect(8, 16, 15, 7, [116, 48, 37]);
dog.ellipse(23, 13, 5, 5, [130, 59, 42]);
dog.line(8, 17, 4, 12, [96, 38, 30]);
dog.rect(10, 22, 3, 7, [86, 37, 30]);
dog.rect(20, 22, 3, 7, [86, 37, 30]);
dog.put(25, 12, C.ink);
const lump = frame(2, 7);
lump.ellipse(16, 20, 12, 7, C.green1);
lump.ellipse(13, 16, 6, 4, C.green2);
lump.ellipse(21, 18, 5, 4, [79, 203, 69]);
lump.put(13, 18, C.ink);
lump.put(20, 18, C.ink);
const snag = frame(3, 7);
snag.disc(16, 17, 8, C.purple1);
snag.rect(11, 8, 4, 7, C.purple0);
snag.rect(19, 8, 4, 7, C.purple0);
snag.rect(8, 20, 4, 8, C.purple0);
snag.rect(20, 20, 4, 8, C.purple0);
snag.put(13, 16, C.white);
snag.put(19, 16, C.white);
snag.line(12, 22, 20, 22, C.ink);
const bat = frame(4, 7);
bat.disc(16, 16, 5, C.purple0);
bat.thickLine(12, 15, 2, 8, [45, 39, 77], 1);
bat.thickLine(12, 17, 2, 24, [45, 39, 77], 1);
bat.thickLine(20, 15, 30, 8, [45, 39, 77], 1);
bat.thickLine(20, 17, 30, 24, [45, 39, 77], 1);
bat.disc(16, 22, 2, C.red2);
const moppet = frame(5, 7);
moppet.disc(16, 14, 9, C.yellow1);
moppet.disc(16, 14, 6, C.yellow2);
moppet.put(12, 12, C.ink);
moppet.put(20, 12, C.ink);
for (let x = 11; x <= 21; x++)
  moppet.put(
    x,
    17 + Math.round(Math.sin(((x - 11) / 10) * Math.PI) * 2),
    C.ink,
  );
moppet.rect(11, 23, 4, 7, C.red1);
moppet.rect(18, 23, 4, 7, C.red1);
const cyber = frame(6, 7);
cyber.outlineRect(11, 6, 10, 20, [99, 143, 177, 130]);
cyber.rect(13, 9, 6, 5, [170, 240, 255, 130]);
cyber.rect(9, 16, 4, 9, [90, 130, 170, 90]);
cyber.rect(20, 16, 4, 9, [90, 130, 170, 90]);
const zyth = frame(7, 7);
zyth.disc(16, 8, 5, C.green2);
zyth.rect(11, 13, 11, 13, C.green1);
zyth.rect(8, 16, 4, 9, C.green0);
zyth.rect(21, 16, 4, 9, C.green0);
zyth.put(14, 7, C.ink);
zyth.put(18, 7, C.ink);
zyth.rect(21, 15, 8, 2, C.purple1);
humanoid(9, 7, [103, 54, 43], [38, 73, 45], C.tan2, C.steel1);

function spiderPose(col, row, raised = false) {
  const c = frame(col, row);
  c.ellipse(16, 18, 9, 6, [34, 27, 43]);
  c.ellipse(17, 12, 6, 5, [45, 34, 57]);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const lift = raised && i % 2 === 0 ? -4 : 3;
      c.thickLine(14 + s * 2, 17, 4 + s * (i * 3), 8 + i * 6 + lift, C.ink, 1);
    }
  }
  c.put(15, 11, C.red2);
  c.put(19, 11, C.red2);
}
spiderPose(0, 16, false);
spiderPose(1, 16, true);
function dogPose(col, row, stride = 0) {
  const c = frame(col, row);
  c.rect(8, 16, 15, 7, [116, 48, 37]);
  c.ellipse(23, 13, 5, 5, [130, 59, 42]);
  c.line(8, 17, 4, 12, [96, 38, 30]);
  c.rect(10, 22 + stride, 3, 7, [86, 37, 30]);
  c.rect(20, 22 - stride, 3, 7, [86, 37, 30]);
  c.put(25, 12, C.ink);
}
dogPose(2, 16, 0);
dogPose(3, 16, 2);
function lumpPose(col, row, squish = 0) {
  const c = frame(col, row);
  c.ellipse(16, 20 + squish, 12, 7 - squish, C.green1);
  c.ellipse(13, 16 + squish, 6, 4, C.green2);
  c.ellipse(21, 18 + squish, 5, 4, [79, 203, 69]);
  c.put(13, 18, C.ink);
  c.put(20, 18, C.ink);
}
lumpPose(4, 16, 0);
lumpPose(5, 16, 2);
function snagPose(col, row, stride = 0) {
  const c = frame(col, row);
  c.disc(16, 17, 8, C.purple1);
  c.rect(11, 8, 4, 7, C.purple0);
  c.rect(19, 8, 4, 7, C.purple0);
  c.rect(8, 20 + stride, 4, 8, C.purple0);
  c.rect(20, 20 - stride, 4, 8, C.purple0);
  c.put(13, 16, C.white);
  c.put(19, 16, C.white);
  c.line(12, 22, 20, 22, C.ink);
}
snagPose(6, 16, 0);
snagPose(7, 16, 2);
function batPose(col, row, flap = 0) {
  const c = frame(col, row);
  c.disc(16, 16, 5, C.purple0);
  c.thickLine(12, 15, 2, 8 + flap, [45, 39, 77], 1);
  c.thickLine(12, 17, 2, 24 - flap, [45, 39, 77], 1);
  c.thickLine(20, 15, 30, 8 + flap, [45, 39, 77], 1);
  c.thickLine(20, 17, 30, 24 - flap, [45, 39, 77], 1);
  c.disc(16, 22, 2, C.red2);
}
batPose(8, 16, 0);
batPose(9, 16, 5);
function moppetPose(col, row, bounce = 0) {
  const c = frame(col, row);
  c.disc(16, 14 - bounce, 9, C.yellow1);
  c.disc(16, 14 - bounce, 6, C.yellow2);
  c.put(12, 12 - bounce, C.ink);
  c.put(20, 12 - bounce, C.ink);
  for (let x = 11; x <= 21; x++)
    c.put(
      x,
      17 - bounce + Math.round(Math.sin(((x - 11) / 10) * Math.PI) * 2),
      C.ink,
    );
  c.rect(11, 23, 4, 7, C.red1);
  c.rect(18, 23, 4, 7, C.red1);
}
moppetPose(10, 16, 0);
moppetPose(11, 16, 2);
bot(12, 16);
bot(13, 16);
humanoid(14, 16, C.green1, [34, 79, 47], C.green2, C.purple1);
humanoid(15, 16, [64, 185, 89], [34, 79, 47], C.green2, C.purple1);

const horror = frame(8, 12, 2, 2);
horror.ellipse(32, 25, 20, 17, C.green1);
horror.ellipse(32, 18, 14, 11, C.green2);
horror.put(25, 22, C.ink);
horror.put(39, 22, C.ink);
for (let i = 0; i < 8; i++) {
  const x = 8 + i * 7;
  horror.thickLine(32, 36, x, 62, i % 2 ? C.green0 : C.green1, 2);
}
horror.disc(32, 30, 3, C.red2);
const horror2 = frame(0, 14, 2, 2);
horror2.ellipse(32, 25, 20, 17, C.green1);
horror2.ellipse(32, 18, 14, 11, C.green2);
horror2.put(25, 22, C.ink);
horror2.put(39, 22, C.ink);
for (let i = 0; i < 8; i++) {
  const x = 7 + i * 7;
  horror2.thickLine(
    32,
    36,
    x + (i % 2 ? 5 : -3),
    61,
    i % 2 ? C.green0 : C.green1,
    2,
  );
}
horror2.disc(32, 30, 3, C.red2);
const dread = frame(10, 12, 2, 2);
dread.outlineRect(8, 20, 48, 30, [69, 75, 86]);
dread.outlineRect(14, 10, 26, 15, [93, 103, 116]);
dread.rect(40, 17, 18, 5, C.ink2);
dread.rect(12, 48, 40, 8, C.ink);
dread.rect(15, 51, 10, 5, C.steel0);
dread.rect(38, 51, 10, 5, C.steel0);
dread.put(23, 17, C.red2);
dread.put(31, 17, C.red2);
const dread2 = frame(2, 14, 2, 2);
dread2.outlineRect(8, 19, 48, 31, [69, 75, 86]);
dread2.outlineRect(16, 9, 26, 15, [93, 103, 116]);
dread2.rect(39, 16, 19, 5, C.ink2);
dread2.rect(12, 48, 40, 8, C.ink);
dread2.rect(14, 51, 10, 5, C.steel0);
dread2.rect(40, 51, 10, 5, C.steel0);
dread2.put(25, 16, C.red2);
dread2.put(33, 16, C.red2);
humanoid(4, 14, [118, 62, 45], [38, 73, 45], C.tan2, C.steel1);

// Keep the original Mission Thunderbolt-style art for every legacy sprite.
// The generated atlas starts from sprites.base.png, but the procedural pass
// above intentionally touches many legacy cells while building the expanded
// sheet. Restore those rows before applying the new 2.5D and item additions.
restoreBaseRows();

function tinyIcon(col, row, draw) {
  const c = frame(col, row);
  c.clear();
  draw(c);
}

function drawBaseRegion(
  c,
  sourceCol,
  sourceRow,
  sourceX,
  sourceY,
  sourceW,
  sourceH,
  destX,
  destY,
  destW,
  destH,
  shade = 1,
) {
  const atlasX = sourceCol * TILE + sourceX;
  const atlasY = sourceRow * TILE + sourceY;
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const sx =
        atlasX + Math.min(sourceW - 1, Math.floor((x / destW) * sourceW));
      const sy =
        atlasY + Math.min(sourceH - 1, Math.floor((y / destH) * sourceH));
      const i = (sy * base.width + sx) * 4;
      const alpha = base.data[i + 3];
      if (alpha <= 24) continue;
      c.put(destX + x, destY + y, [
        Math.round(base.data[i] * shade),
        Math.round(base.data[i + 1] * shade),
        Math.round(base.data[i + 2] * shade),
        alpha,
      ]);
    }
  }
}

function extrudedWall(col, row, sourceCol, sourceRow, options = {}) {
  const c = frame(col, row, 1, 2);
  c.clear();

  const mask = options.mask ?? 0;
  const connectsNorth = (mask & 1) !== 0;
  const connectsEast = (mask & 2) !== 0;
  const connectsSouth = (mask & 4) !== 0;
  const connectsWest = (mask & 8) !== 0;
  const faceShade = options.faceShade ?? 0.72;
  const sideShade = options.sideShade ?? 0.48;
  const topY = connectsNorth ? 0 : (options.topY ?? 5);
  const topHeight = connectsNorth ? 0 : (options.topHeight ?? 13);
  const faceY = topY + topHeight;
  const faceHeight = 63 - faceY;
  const outerLeft = connectsWest ? 0 : 1;
  const outerRight = connectsEast ? 32 : 31;
  const contentLeft = connectsWest ? 0 : 2;
  const contentRight = connectsEast ? 32 : 30;

  c.rect(
    outerLeft,
    connectsNorth ? 0 : topY + 2,
    outerRight - outerLeft,
    connectsNorth ? 63 : 58 - topY,
    C.ink,
  );
  if (!connectsNorth) {
    drawBaseRegion(
      c,
      sourceCol,
      sourceRow,
      0,
      0,
      32,
      32,
      contentLeft,
      topY,
      contentRight - contentLeft,
      topHeight,
      1.08,
    );
  }
  drawBaseRegion(
    c,
    sourceCol,
    sourceRow,
    0,
    0,
    32,
    32,
    contentLeft,
    faceY,
    contentRight - contentLeft,
    faceHeight,
    faceShade,
  );

  if (!connectsNorth) {
    c.line(contentLeft, faceY, contentRight - 1, faceY, C.white);
    c.line(contentLeft, faceY + 1, contentRight - 1, faceY + 1, C.concrete0);
  }
  if (!connectsSouth) {
    c.line(contentLeft, 62, contentRight - 1, 62, C.black);
  }
  if (!connectsWest) {
    c.rect(2, faceY, 3, faceHeight, [
      Math.round(C.ink2[0] * sideShade),
      Math.round(C.ink2[1] * sideShade),
      Math.round(C.ink2[2] * sideShade),
    ]);
  }
  if (!connectsEast) {
    c.rect(27, faceY, 3, faceHeight, C.ink2);
  }
}

function connectedHole(col, row, mask) {
  const c = frame(col, row);
  c.clear();

  const connectsNorth = (mask & 1) !== 0;
  const connectsEast = (mask & 2) !== 0;
  const connectsSouth = (mask & 4) !== 0;
  const connectsWest = (mask & 8) !== 0;
  const left = connectsWest ? 0 : 4;
  const right = connectsEast ? 32 : 28;
  const top = connectsNorth ? 0 : 4;
  const bottom = connectsSouth ? 32 : 28;

  c.rect(left, top, right - left, bottom - top, [3, 4, 7, 245]);
  c.rect(
    left + (connectsWest ? 0 : 2),
    top + (connectsNorth ? 0 : 2),
    right - left - (connectsWest ? 0 : 2) - (connectsEast ? 0 : 2),
    bottom - top - (connectsNorth ? 0 : 2) - (connectsSouth ? 0 : 2),
    [0, 0, 2, 255],
  );

  if (!connectsNorth) {
    c.line(left + 3, top, right - 4, top, C.concrete0);
    c.put(left + 1, top + 2, C.ink2);
    c.put(right - 2, top + 1, C.ink2);
  }
  if (!connectsSouth) {
    c.line(left + 3, bottom - 1, right - 4, bottom - 1, C.ink);
    c.put(left + 2, bottom - 3, C.concrete0);
  }
  if (!connectsWest) {
    c.line(left, top + 3, left, bottom - 4, C.concrete0);
    c.put(left + 2, top + 1, C.ink2);
  }
  if (!connectsEast) {
    c.line(right - 1, top + 3, right - 1, bottom - 4, C.ink);
    c.put(right - 3, bottom - 2, C.concrete0);
  }
}

function extrudedDoor(col, row, sourceCol, sourceRow, options = {}) {
  const c = frame(col, row, 1, 2);
  c.clear();

  drawBaseRegion(c, 0, 0, 0, 0, 32, 32, 1, 5, 30, 13, 1.05);
  c.rect(1, 17, 30, 46, C.ink);
  drawBaseRegion(c, sourceCol, sourceRow, 0, 0, 32, 32, 4, 18, 24, 44, 0.82);
  c.line(4, 18, 27, 18, C.white);
  c.rect(1, 18, 3, 44, [10, 11, 14]);
  c.rect(28, 18, 3, 44, [10, 11, 14]);
  c.line(4, 62, 27, 62, C.black);

  if (options.locked) {
    c.rect(19, 39, 6, 7, C.ink);
    c.rect(20, 40, 4, 5, C.steel2);
    c.put(22, 42, C.red2);
  }
}

// 2.5D structural sprites now reuse original textures instead of switching to
// the chunky procedural look.
extrudedWall(0, 8, 0, 0);
extrudedWall(1, 8, 10, 0, { faceShade: 0.76 });
extrudedWall(2, 8, 6, 0);
extrudedWall(3, 8, 7, 0);
extrudedWall(4, 8, 11, 0, { faceShade: 0.76 });
extrudedWall(5, 8, 12, 0, { faceShade: 0.76 });
extrudedDoor(6, 8, 2, 0);
extrudedDoor(7, 8, 3, 0);
extrudedDoor(8, 8, 2, 0, { locked: true });

const wallAutotileFamilies = [
  { row: 18, sourceCol: 0, sourceRow: 0, faceShade: 0.72 },
  { row: 22, sourceCol: 6, sourceRow: 0, faceShade: 0.72 },
  { row: 26, sourceCol: 7, sourceRow: 0, faceShade: 0.72 },
  { row: 30, sourceCol: 10, sourceRow: 0, faceShade: 0.76 },
  { row: 34, sourceCol: 11, sourceRow: 0, faceShade: 0.76 },
  { row: 38, sourceCol: 12, sourceRow: 0, faceShade: 0.76 },
];
for (const family of wallAutotileFamilies) {
  for (let mask = 0; mask < 16; mask++) {
    extrudedWall(
      mask % 8,
      family.row + Math.floor(mask / 8) * 2,
      family.sourceCol,
      family.sourceRow,
      {
        faceShade: family.faceShade,
        mask,
      },
    );
  }
}
for (let mask = 0; mask < 16; mask++) {
  connectedHole(mask, 42, mask);
}

drawBaseSprite(0, 10, 5, 4, { cellsW: 2, cellsH: 3, scale: 2, y: 25 });
drawBaseSprite(2, 10, 6, 4, { cellsH: 2, y: 25 });
drawBaseSprite(3, 10, 7, 4, { cellsH: 2, y: 28 });
drawBaseSprite(4, 10, 9, 4, { cellsH: 2, y: 25 });
drawBaseSprite(5, 10, 6, 4);
drawBaseSprite(6, 10, 7, 4, { cellsH: 2, y: 28 });
drawBaseSprite(7, 10, 7, 4, { cellsH: 2, y: 18 });

// Missing non-reference items redrawn as tiny 1992-style icons.
tinyIcon(4, 5, (c) => {
  c.line(13, 25, 23, 6, [0, 0, 0]);
  c.line(14, 25, 24, 7, [205, 205, 205]);
  c.rect(10, 24, 7, 2, [95, 95, 110]);
  c.rect(12, 26, 3, 4, [75, 47, 31]);
});
tinyIcon(5, 5, (c) => {
  c.line(14, 25, 23, 5, [0, 0, 0]);
  c.line(15, 25, 24, 6, [91, 239, 255]);
  c.line(13, 24, 22, 7, [207, 255, 255]);
  c.rect(10, 24, 7, 2, [135, 135, 150]);
  c.rect(12, 26, 3, 4, [31, 31, 38]);
});
tinyIcon(8, 5, (c) => {
  c.rect(10, 10, 13, 14, [0, 0, 0]);
  c.rect(11, 11, 11, 12, [0, 220, 238, 100]);
  c.line(11, 15, 21, 15, [176, 255, 255, 170]);
  c.line(16, 11, 16, 22, [176, 255, 255, 150]);
});
tinyIcon(11, 5, (c) => {
  c.ellipse(16, 17, 5, 3, [0, 0, 0]);
  c.put(18, 15, [75, 75, 82]);
});
tinyIcon(12, 5, (c) => {
  c.disc(16, 17, 3, [0, 0, 0]);
  c.disc(16, 17, 2, [237, 180, 52]);
  c.put(15, 16, [255, 238, 107]);
});
tinyIcon(13, 5, (c) => {
  c.ellipse(16, 19, 5, 3, [0, 0, 0]);
  c.ellipse(16, 18, 4, 3, [118, 118, 122]);
  c.put(18, 16, [174, 174, 178]);
});
tinyIcon(14, 5, (c) => {
  c.rect(10, 21, 5, 3, [82, 80, 77]);
  c.rect(16, 18, 5, 6, [122, 116, 106]);
  c.rect(21, 22, 4, 2, [93, 87, 79]);
});
tinyIcon(15, 5, (c) => {
  c.ellipse(16, 20, 7, 4, [42, 68, 40]);
  c.rect(11, 15, 7, 5, [132, 118, 76]);
  c.line(9, 22, 23, 15, [0, 0, 0]);
});
tinyIcon(0, 6, (c) => {
  c.line(9, 23, 19, 13, [0, 0, 0]);
  c.line(10, 22, 20, 12, [150, 160, 172]);
  c.line(15, 23, 24, 22, [210, 216, 224]);
  c.rect(18, 15, 4, 3, [156, 74, 42]);
});
tinyIcon(2, 6, (c) => {
  c.line(5, 16, 27, 16, [0, 0, 0]);
  c.line(6, 15, 26, 15, [87, 240, 255]);
  c.put(27, 16, [229, 255, 255]);
});
tinyIcon(6, 7, (c) => {
  c.rect(12, 7, 9, 20, [100, 205, 235, 72]);
  c.rect(13, 9, 7, 5, [206, 255, 255, 92]);
  c.rect(9, 16, 4, 9, [100, 205, 235, 48]);
  c.rect(20, 16, 4, 9, [100, 205, 235, 48]);
});
tinyIcon(12, 16, (c) => {
  c.rect(12, 7, 9, 20, [100, 205, 235, 58]);
  c.rect(13, 9, 7, 5, [206, 255, 255, 84]);
  c.rect(9, 16, 4, 9, [100, 205, 235, 44]);
  c.rect(20, 16, 4, 9, [100, 205, 235, 44]);
});
tinyIcon(13, 16, (c) => {
  c.rect(12, 6, 9, 20, [100, 205, 235, 48]);
  c.rect(13, 8, 7, 5, [206, 255, 255, 78]);
  c.rect(9, 17, 4, 9, [100, 205, 235, 40]);
  c.rect(20, 15, 4, 9, [100, 205, 235, 40]);
});

// Reference-faithful replacements from original Mission Thunderbolt sprites.
// These intentionally preserve the tiny, high-contrast 1992 icon scale.
drawReferenceSprite(10, 5, "cookie.png");
drawReferenceSprite(1, 7, "dog.png");
drawReferenceSprite(2, 16, "dog.png");
drawReferenceSprite(3, 16, "dog.png", { offsetY: 1 });
drawReferenceSprite(4, 7, "flutterbang.png");
drawReferenceSprite(8, 16, "flutterbang.png");
drawReferenceSprite(9, 16, "flutterbang.png", { offsetY: -2 });
drawReferenceSprite(0, 3, "gyrojot-rifle.png");
drawReferenceSprite(3, 5, "gyrojot-shotgun.png");
drawReferenceSprite(10, 12, "dreadnaut.png", {
  cellsW: 2,
  cellsH: 2,
  scale: 1.7,
});
drawReferenceSprite(2, 14, "dreadnaut.png", {
  cellsW: 2,
  cellsH: 2,
  scale: 1.7,
  offsetX: 2,
});
drawReferenceSprite(0, 5, "butcher-knife.png");
drawReferenceSprite(9, 5, "bone.png");
drawReferenceSprite(2, 5, "gyrojot-smg.png");
drawReferenceSprite(2, 7, "icky-lump.png");
drawReferenceSprite(4, 16, "icky-lump.png");
drawReferenceSprite(5, 16, "icky-lump.png", { offsetY: 1 });
drawReferenceSprite(1, 5, "laser-gun.png");
drawReferenceSprite(6, 5, "macrometal-armor.png");
drawReferenceSprite(5, 7, "moppet.png");
drawReferenceSprite(10, 16, "moppet.png");
drawReferenceSprite(11, 16, "moppet.png", { offsetY: -1 });
drawReferenceSprite(7, 5, "panic-button.png");
drawReferenceSprite(8, 3, "powercell.png");
drawReferenceSprite(3, 7, "snagglepuss.png");
drawReferenceSprite(6, 16, "snagglepuss.png");
drawReferenceSprite(7, 16, "snagglepuss.png", { offsetY: -1 });
drawReferenceSprite(0, 7, "spider.png");
drawReferenceSprite(0, 16, "spider.png");
drawReferenceSprite(1, 16, "spider.png", { offsetY: -1 });
drawReferenceSprite(8, 12, "tentacular-horror.png", {
  cellsW: 2,
  cellsH: 2,
  scale: 1.55,
});
drawReferenceSprite(0, 14, "tentacular-horror.png", {
  cellsW: 2,
  cellsH: 2,
  scale: 1.55,
  offsetX: -2,
});
drawReferenceSprite(9, 7, "terrorist-collaborator.png");
drawReferenceSprite(4, 14, "terrorist-collaborator.png");
drawReferenceSprite(10, 2, "utility-bot.png");
drawReferenceSprite(11, 2, "utility-bot.png", { offsetY: -1 });
drawReferenceSprite(12, 2, "utility-bot.png", { offsetY: 1 });
drawReferenceSprite(1, 6, "vending-machine.png");
drawReferenceSprite(7, 7, "zyth.png");
drawReferenceSprite(14, 16, "zyth.png");
drawReferenceSprite(15, 16, "zyth.png", { offsetY: -1 });

writeFileSync(OUT, encodePNG(W, H, data));
console.log(`spritesheet: ${W}x${H}, generated 2.5D atlas -> ${OUT}`);
