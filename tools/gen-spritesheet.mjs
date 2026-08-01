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
const ENVIRONMENT_BOARD = join(
  HERE,
  "..",
  "assets-src",
  "production",
  "environment-board.png",
);
const CHARACTER_BOARD = join(
  HERE,
  "..",
  "assets-src",
  "production",
  "characters-board.png",
);
const SUPPLEMENTAL_BOARD = join(
  HERE,
  "..",
  "assets-src",
  "production",
  "supplemental-board.png",
);
const OUT = join(HERE, "..", "app", "assets", "img", "sprites.png");

const TILE = 32;
const COLS = 16;
const OUT_ROWS = 43;
const environmentBoard = decodePNG(readFileSync(ENVIRONMENT_BOARD));
const characterBoard = decodePNG(readFileSync(CHARACTER_BOARD));
const supplementalBoard = decodePNG(readFileSync(SUPPLEMENTAL_BOARD));
const W = COLS * TILE;
const H = OUT_ROWS * TILE;
const data = new Uint8Array(W * H * 4);
const frameOwners = new Map();
// Rebuilding palette: colored separation replaces universal black contours.
const C = {
  ink: [13, 32, 49],
  ink2: [22, 50, 67],
  steel0: [39, 66, 88],
  steel1: [111, 139, 156],
  steel2: [185, 210, 205],
  white: [246, 239, 194],
  concrete0: [69, 61, 91],
  concrete1: [133, 130, 132],
  concrete2: [215, 209, 174],
  rust: [205, 113, 69],
  wood0: [112, 72, 42],
  wood1: [163, 102, 52],
  wood2: [211, 145, 70],
  grass0: [27, 78, 67],
  grass1: [39, 113, 76],
  grass2: [65, 151, 83],
  grass3: [171, 220, 105],
  weed0: [37, 91, 69],
  weed1: [112, 190, 91],
  road0: [39, 66, 88],
  road1: [91, 73, 112],
  road2: [133, 130, 132],
  sidewalk0: [105, 91, 96],
  sidewalk1: [173, 172, 155],
  tan0: [104, 61, 53],
  tan1: [205, 113, 69],
  tan2: [247, 193, 108],
  gold0: [184, 121, 39],
  gold1: [240, 177, 47],
  gold2: [255, 220, 91],
  red0: [171, 61, 69],
  red1: [229, 78, 77],
  red2: [247, 126, 100],
  blue0: [15, 94, 110],
  blue1: [61, 132, 191],
  blue2: [111, 185, 229],
  cyan0: [22, 137, 150],
  cyan1: [31, 184, 180],
  cyan2: [134, 231, 223],
  purple0: [91, 55, 132],
  purple1: [140, 87, 181],
  purple2: [193, 132, 218],
  green0: [27, 78, 67],
  green1: [65, 151, 83],
  green2: [202, 239, 151],
  yellow0: [184, 121, 39],
  yellow1: [240, 177, 47],
  yellow2: [255, 220, 91],
  black: [13, 32, 49],
};

const LEGACY_TO_CURRENT = new Map(
  [
    [[5, 6, 8], C.ink],
    [[0, 0, 0], C.ink],
    [[15, 17, 22], C.ink],
    [[27, 31, 40], C.ink2],
    [[58, 64, 78], C.steel0],
    [[112, 124, 144], C.steel1],
    [[184, 196, 210], C.steel2],
    [[238, 240, 232], C.white],
    [[58, 61, 67], C.concrete0],
    [[92, 98, 108], C.concrete1],
    [[134, 142, 152], C.concrete2],
    [[154, 74, 42], C.rust],
    [[72, 47, 31], C.wood0],
    [[118, 77, 43], C.wood1],
    [[171, 118, 66], C.wood2],
    [[24, 51, 29], C.grass0],
    [[45, 104, 46], C.grass1],
    [[88, 161, 71], C.grass2],
    [[139, 203, 91], C.grass3],
    [[37, 61, 31], C.weed0],
    [[84, 125, 52], C.weed1],
    [[26, 29, 34], C.road0],
    [[48, 53, 62], C.road1],
    [[82, 86, 91], C.road2],
    [[76, 80, 80], C.sidewalk0],
    [[128, 132, 124], C.sidewalk1],
    [[104, 76, 48], C.tan0],
    [[177, 135, 82], C.tan1],
    [[228, 184, 113], C.tan2],
    [[158, 111, 28], C.gold0],
    [[234, 184, 55], C.gold1],
    [[255, 227, 105], C.gold2],
    [[92, 25, 27], C.red0],
    [[181, 42, 44], C.red1],
    [[245, 83, 67], C.red2],
    [[26, 47, 88], C.blue0],
    [[50, 96, 180], C.blue1],
    [[100, 203, 255], C.blue2],
    [[26, 109, 128], C.cyan0],
    [[68, 224, 236], C.cyan1],
    [[190, 255, 250], C.cyan2],
    [[58, 34, 92], C.purple0],
    [[130, 70, 185], C.purple1],
    [[207, 112, 238], C.purple2],
    [[24, 77, 52], C.green0],
    [[52, 166, 84], C.green1],
    [[119, 226, 108], C.green2],
    [[162, 94, 22], C.yellow0],
    [[238, 169, 45], C.yellow1],
    [[255, 224, 79], C.yellow2],
  ].map(([from, to]) => [from.join(","), to]),
);

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
  const outlineRect = (x, y, w, h, fill, shadow = C.ink) => {
    rect(x, y, w, h, fill);
    if (w > 1) rect(x + 1, y + h - 1, w - 1, 1, shadow);
    if (h > 1) rect(x + w - 1, y + 1, 1, h - 1, shadow);
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

function drawProductionCell(
  col,
  row,
  source,
  sourceCol,
  sourceRow,
  options = {},
) {
  const cellsW = options.cellsW ?? 1;
  const cellsH = options.cellsH ?? 1;
  const c = frame(col, row, cellsW, cellsH);
  if (options.clear !== false) c.clear();

  const sourceCellW = Math.floor(source.width / 6);
  const sourceCellH = Math.floor(source.height / 4);
  const cellX = sourceCol * sourceCellW;
  const cellY = sourceRow * sourceCellH;
  let minX = cellX;
  let minY = cellY;
  let maxX = cellX + sourceCellW - 1;
  let maxY = cellY + sourceCellH - 1;

  if (options.crop) {
    const [left, top, right, bottom] = options.crop;
    minX = cellX + Math.round(sourceCellW * left);
    minY = cellY + Math.round(sourceCellH * top);
    maxX = cellX + Math.round(sourceCellW * right) - 1;
    maxY = cellY + Math.round(sourceCellH * bottom) - 1;
  } else {
    minX = cellX + sourceCellW;
    minY = cellY + sourceCellH;
    maxX = cellX - 1;
    maxY = cellY - 1;
    for (let y = cellY; y < cellY + sourceCellH; y++) {
      for (let x = cellX; x < cellX + sourceCellW; x++) {
        const index = (y * source.width + x) * 4;
        if (source.data[index + 3] <= 24) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return;

  const spriteW = maxX - minX + 1;
  const spriteH = maxY - minY + 1;
  const targetW = cellsW * TILE;
  const targetH = cellsH * TILE;
  const padding = options.padding ?? 1;
  const drawScale =
    options.fill === true
      ? null
      : Math.min(
          (targetW - padding * 2) / spriteW,
          (targetH - padding * 2) / spriteH,
        );
  const drawW =
    options.fill === true
      ? targetW
      : Math.max(1, Math.round(spriteW * drawScale));
  const drawH =
    options.fill === true
      ? targetH
      : Math.max(1, Math.round(spriteH * drawScale));
  const baseX =
    Math.floor((targetW - drawW) / 2) + Math.round(options.offsetX ?? 0);
  const baseY =
    Math.floor((targetH - drawH) / 2) + Math.round(options.offsetY ?? 0);

  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const sourceX = minX + Math.floor((x / drawW) * spriteW);
      const sourceY = minY + Math.floor((y / drawH) * spriteH);
      const index = (sourceY * source.width + sourceX) * 4;
      if (source.data[index + 3] <= 24) continue;
      c.put(baseX + x, baseY + y, [
        source.data[index],
        source.data[index + 1],
        source.data[index + 2],
        source.data[index + 3],
      ]);
    }
  }
}

function drawProductionTile(col, row, sourceCol, sourceRow, variant = 0) {
  const crops = [
    [0.27, 0.25, 0.91, 0.89],
    [0.16, 0.28, 0.8, 0.92],
    [0.32, 0.14, 0.96, 0.78],
  ];
  drawProductionCell(col, row, environmentBoard, sourceCol, sourceRow, {
    clear: false,
    crop: crops[variant % crops.length],
    fill: true,
    padding: 0,
  });
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

// Legacy source images are sampled only for named sprites that have not yet
// received a production replacement. Unnamed legacy cells never enter the atlas.

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
  const isWood = sourceCol >= 10 && sourceCol <= 12;
  const materialCol = isWood ? 0 : 5;
  const materialRow = isWood ? 2 : 1;
  const sourceCellW = Math.floor(environmentBoard.width / 6);
  const sourceCellH = Math.floor(environmentBoard.height / 4);
  const atlasX = materialCol * sourceCellW + Math.round(sourceCellW * 0.25);
  const atlasY = materialRow * sourceCellH + Math.round(sourceCellH * 0.2);
  const materialW = Math.round(sourceCellW * 0.62);
  const materialH = Math.round(sourceCellH * 0.64);
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const sx =
        atlasX + Math.min(materialW - 1, Math.floor((x / destW) * materialW));
      const sy =
        atlasY + Math.min(materialH - 1, Math.floor((y / destH) * materialH));
      const i = (sy * environmentBoard.width + sx) * 4;
      const alpha = environmentBoard.data[i + 3];
      if (alpha <= 24) continue;
      c.put(destX + x, destY + y, [
        Math.round(environmentBoard.data[i] * shade),
        Math.round(environmentBoard.data[i + 1] * shade),
        Math.round(environmentBoard.data[i + 2] * shade),
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

// Milestone 1 terrain laboratory. These cells intentionally use broad colored
// clusters and selective undersides instead of perimeter outlines.
const prototypeGrass = frame(0, 17);
prototypeGrass.clear();
prototypeGrass.rect(0, 0, 32, 32, C.grass2);
prototypeGrass.rect(3, 10, 8, 5, C.grass1);
prototypeGrass.rect(9, 13, 5, 4, C.grass1);
prototypeGrass.rect(22, 5, 7, 4, C.grass3);
prototypeGrass.rect(18, 24, 10, 4, C.grass1);
prototypeGrass.rect(4, 27, 6, 3, C.grass3);

const prototypeGrassFlowers = frame(1, 17);
prototypeGrassFlowers.clear();
prototypeGrassFlowers.rect(0, 0, 32, 32, C.grass2);
prototypeGrassFlowers.rect(3, 22, 9, 5, C.grass1);
prototypeGrassFlowers.rect(21, 8, 7, 4, C.grass3);
for (const [x, y, color] of [
  [7, 8, [246, 239, 194]],
  [15, 20, [238, 154, 195]],
  [25, 25, [193, 132, 218]],
  [27, 14, [255, 220, 91]],
]) {
  prototypeGrassFlowers.rect(x, y, 2, 2, color);
}

const prototypeDirt = frame(2, 17);
prototypeDirt.clear();
prototypeDirt.rect(0, 0, 32, 32, C.tan1);
prototypeDirt.rect(4, 10, 12, 5, [183, 94, 62]);
prototypeDirt.rect(18, 20, 10, 5, C.tan0);
prototypeDirt.rect(8, 27, 7, 3, C.tan2);

const prototypeStone = frame(3, 17);
prototypeStone.clear();
prototypeStone.rect(0, 0, 32, 32, C.concrete1);
prototypeStone.rect(3, 8, 13, 8, [154, 153, 143]);
prototypeStone.rect(18, 17, 11, 7, C.steel0);
prototypeStone.rect(5, 27, 9, 3, C.concrete2);

const prototypeWaterShallow = frame(4, 17);
prototypeWaterShallow.clear();
prototypeWaterShallow.rect(0, 0, 32, 32, C.cyan1);
prototypeWaterShallow.rect(2, 13, 12, 3, [80, 215, 204]);
prototypeWaterShallow.rect(17, 23, 13, 3, C.cyan0);
prototypeWaterShallow.rect(22, 8, 7, 2, C.white);

const prototypeWaterDeep = frame(5, 17);
prototypeWaterDeep.clear();
prototypeWaterDeep.rect(0, 0, 32, 32, C.cyan0);
prototypeWaterDeep.rect(3, 12, 11, 3, [22, 137, 150]);
prototypeWaterDeep.rect(16, 24, 14, 3, C.blue0);
prototypeWaterDeep.rect(20, 8, 8, 2, C.cyan2);

function prototypeCliff(col, tall = false) {
  const c = frame(col, 17);
  c.clear();
  c.rect(0, 0, 32, 32, tall ? C.tan0 : [154, 83, 58]);
  c.rect(0, 0, 32, tall ? 6 : 9, C.grass1);
  c.rect(0, tall ? 5 : 8, 32, 4, C.tan2);
  c.rect(3, tall ? 11 : 13, 11, tall ? 14 : 10, C.tan1);
  c.rect(16, tall ? 9 : 14, 13, tall ? 8 : 6, C.rust);
  c.rect(20, tall ? 20 : 22, 9, 7, C.tan0);
  c.rect(5, 27, 12, 5, C.ink2);
  c.rect(0, 30, 32, 2, C.ink);
  c.rect(6, tall ? 8 : 11, 4, 3, C.grass3);
}
prototypeCliff(6, false);
prototypeCliff(7, true);

for (const [col, side] of [
  [8, "north"],
  [9, "east"],
  [10, "south"],
  [11, "west"],
]) {
  const c = frame(col, 17);
  c.clear();
  if (side === "north") c.rect(0, 0, 32, 4, C.tan2);
  if (side === "east") c.rect(28, 0, 4, 32, C.tan0);
  if (side === "south") c.rect(0, 27, 32, 5, C.tan0);
  if (side === "west") c.rect(0, 0, 4, 32, C.tan2);
}

const prototypeGrassAlt = frame(12, 17);
prototypeGrassAlt.clear();
prototypeGrassAlt.rect(0, 0, 32, 32, C.grass2);
prototypeGrassAlt.rect(1, 23, 11, 5, C.grass1);
prototypeGrassAlt.rect(20, 15, 9, 4, C.grass3);
prototypeGrassAlt.rect(9, 4, 6, 4, [112, 190, 91]);

const prototypeDirtAlt = frame(13, 17);
prototypeDirtAlt.clear();
prototypeDirtAlt.rect(0, 0, 32, 32, C.tan1);
prototypeDirtAlt.rect(2, 21, 13, 5, C.tan0);
prototypeDirtAlt.rect(19, 7, 10, 5, C.tan2);
prototypeDirtAlt.rect(12, 14, 7, 4, C.rust);

const prototypeStoneAlt = frame(14, 17);
prototypeStoneAlt.clear();
prototypeStoneAlt.rect(0, 0, 32, 32, C.concrete1);
prototypeStoneAlt.rect(2, 18, 14, 8, C.steel0);
prototypeStoneAlt.rect(18, 5, 11, 7, C.concrete2);
prototypeStoneAlt.rect(12, 13, 8, 4, [154, 153, 143]);

const prototypeWaterAlt = frame(15, 17);
prototypeWaterAlt.clear();
prototypeWaterAlt.rect(0, 0, 32, 32, C.cyan1);
prototypeWaterAlt.rect(3, 22, 15, 3, C.cyan0);
prototypeWaterAlt.rect(17, 9, 12, 3, C.cyan2);
prototypeWaterAlt.rect(7, 13, 6, 2, C.white);

const prototypeBridge = frame(8, 18);
prototypeBridge.clear();
prototypeBridge.rect(0, 6, 32, 22, C.wood0);
prototypeBridge.rect(0, 7, 32, 5, C.wood2);
prototypeBridge.rect(0, 14, 32, 4, C.wood1);
prototypeBridge.rect(0, 21, 32, 4, C.wood2);
prototypeBridge.rect(0, 27, 32, 3, C.ink2);
prototypeBridge.rect(4, 4, 3, 27, C.gold0);
prototypeBridge.rect(25, 4, 3, 27, C.gold0);

const prototypeStairs = frame(9, 18);
prototypeStairs.clear();
prototypeStairs.rect(3, 3, 26, 27, C.tan0);
for (let step = 0; step < 5; step++) {
  const inset = 3 + step * 2;
  prototypeStairs.rect(inset, 4 + step * 5, 26 - step * 4, 4, C.tan2);
  prototypeStairs.rect(inset, 8 + step * 5, 26 - step * 4, 2, C.ink2);
}

const prototypeGarden = frame(10, 18);
prototypeGarden.clear();
prototypeGarden.rect(2, 3, 28, 27, C.wood0);
prototypeGarden.rect(4, 5, 24, 23, C.tan0);
for (const x of [7, 15, 23]) {
  prototypeGarden.rect(x, 8, 3, 15, C.grass1);
  prototypeGarden.rect(x - 2, 11, 7, 5, C.grass3);
  prototypeGarden.rect(x - 1, 8, 5, 4, C.yellow1);
}

const prototypeFlowers = frame(11, 18);
prototypeFlowers.clear();
prototypeFlowers.rect(14, 13, 4, 17, C.grass0);
prototypeFlowers.rect(9, 18, 7, 5, C.grass2);
prototypeFlowers.rect(17, 20, 8, 5, C.grass3);
prototypeFlowers.rect(9, 9, 7, 7, [238, 154, 195]);
prototypeFlowers.rect(17, 7, 7, 7, C.purple2);
prototypeFlowers.rect(13, 5, 6, 6, C.gold2);

const prototypeWorkshop = frame(8, 20, 3, 3);
prototypeWorkshop.clear();
prototypeWorkshop.ellipse(48, 82, 39, 9, [13, 32, 49, 90]);
prototypeWorkshop.rect(10, 35, 76, 48, C.wood1);
prototypeWorkshop.rect(15, 39, 66, 39, C.rust);
prototypeWorkshop.rect(20, 47, 23, 31, C.tan2);
prototypeWorkshop.rect(50, 49, 24, 29, C.cyan0);
prototypeWorkshop.rect(55, 54, 14, 12, C.cyan2);
prototypeWorkshop.rect(5, 28, 86, 13, C.red1);
prototypeWorkshop.rect(13, 20, 70, 13, C.red2);
prototypeWorkshop.rect(23, 14, 50, 10, C.gold1);
prototypeWorkshop.rect(28, 10, 40, 8, C.gold2);
prototypeWorkshop.rect(43, 55, 8, 28, C.ink2);
prototypeWorkshop.rect(45, 58, 5, 18, C.purple1);
prototypeWorkshop.rect(10, 41, 8, 8, C.grass3);
prototypeWorkshop.rect(72, 35, 9, 7, C.purple2);

const prototypeCave = frame(11, 20, 2, 2);
prototypeCave.clear();
prototypeCave.ellipse(32, 55, 29, 9, [13, 32, 49, 80]);
prototypeCave.rect(5, 23, 54, 34, C.tan0);
prototypeCave.rect(10, 16, 44, 36, C.tan1);
prototypeCave.rect(16, 11, 32, 40, C.tan2);
prototypeCave.ellipse(32, 43, 18, 23, C.ink);
prototypeCave.ellipse(32, 46, 13, 19, [22, 50, 67]);
prototypeCave.rect(11, 17, 9, 7, C.grass2);
prototypeCave.rect(43, 20, 8, 7, C.grass3);
prototypeCave.rect(21, 13, 8, 5, C.gold1);

const prototypeTree = frame(13, 20, 2, 3);
prototypeTree.clear();
prototypeTree.ellipse(32, 87, 24, 7, [13, 32, 49, 80]);
prototypeTree.rect(27, 48, 11, 39, C.wood0);
prototypeTree.rect(31, 43, 8, 40, C.wood1);
prototypeTree.rect(35, 50, 5, 27, C.wood2);
prototypeTree.ellipse(24, 42, 22, 25, C.grass1);
prototypeTree.ellipse(42, 39, 20, 24, C.grass0);
prototypeTree.ellipse(33, 25, 25, 23, C.grass2);
prototypeTree.ellipse(18, 28, 15, 16, C.grass3);
prototypeTree.ellipse(43, 21, 14, 14, [112, 190, 91]);
prototypeTree.rect(16, 16, 10, 7, [171, 220, 105]);
prototypeTree.rect(38, 12, 9, 7, C.grass3);
prototypeTree.rect(47, 31, 8, 6, C.grass1);

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
// Matter Manipulator: a handheld emitter with a glowing cyan tip.
tinyIcon(3, 6, (c) => {
  c.rect(10, 22, 4, 6, [70, 74, 82]);
  c.line(12, 24, 22, 10, [120, 126, 138]);
  c.line(13, 24, 23, 10, [158, 166, 180]);
  c.disc(23, 9, 3, [0, 220, 238, 170]);
  c.put(23, 9, [210, 255, 255]);
});
// Wall block (placeable): a gray brick cube.
tinyIcon(4, 6, (c) => {
  c.rect(9, 11, 14, 12, [0, 0, 0]);
  c.rect(10, 12, 12, 10, [96, 102, 112]);
  c.line(10, 17, 21, 17, [60, 64, 72]);
  c.line(16, 12, 16, 16, [60, 64, 72]);
  c.line(13, 18, 13, 21, [60, 64, 72]);
  c.line(19, 18, 19, 21, [60, 64, 72]);
});
// Building block (placeable): a bluish metal panel.
tinyIcon(5, 6, (c) => {
  c.rect(9, 11, 14, 12, [0, 0, 0]);
  c.rect(10, 12, 12, 10, [70, 86, 120]);
  c.rect(11, 13, 10, 3, [96, 116, 156]);
  c.put(12, 19, [40, 50, 74]);
  c.put(19, 19, [40, 50, 74]);
});
// Fence block (placeable): a short railing segment.
tinyIcon(6, 6, (c) => {
  c.rect(10, 12, 2, 12, [120, 126, 130]);
  c.rect(20, 12, 2, 12, [120, 126, 130]);
  c.rect(9, 15, 14, 2, [140, 146, 150]);
  c.rect(9, 20, 14, 2, [140, 146, 150]);
});
// Door (placeable): a small paneled door with a knob.
tinyIcon(8, 6, (c) => {
  c.rect(11, 8, 10, 18, [0, 0, 0]);
  c.rect(12, 9, 8, 16, [150, 116, 74]);
  c.rect(13, 11, 6, 5, [120, 92, 58]);
  c.rect(13, 18, 6, 5, [120, 92, 58]);
  c.put(18, 17, [230, 210, 120]);
});
// Tree (placeable): a small leafy sapling.
tinyIcon(9, 6, (c) => {
  c.rect(15, 18, 3, 8, [92, 66, 40]);
  c.disc(16, 13, 6, [52, 104, 50]);
  c.disc(13, 15, 4, [64, 122, 58]);
  c.disc(19, 15, 4, [64, 122, 58]);
});
// Light fixture (placeable): a lamppost with a glowing head.
tinyIcon(10, 6, (c) => {
  c.rect(15, 12, 2, 14, [96, 100, 108]);
  c.rect(11, 24, 10, 2, [80, 84, 92]);
  c.disc(16, 10, 4, [255, 214, 112]);
  c.disc(16, 10, 2, [255, 244, 200]);
});
// Pickaxe: a compact steel head on a warm reclaimed-wood handle.
tinyIcon(11, 6, (c) => {
  c.thickLine(10, 26, 22, 10, C.wood1, 1);
  c.line(11, 25, 23, 9, C.wood2);
  c.thickLine(14, 8, 27, 13, C.steel0, 1);
  c.line(15, 7, 27, 12, C.steel2);
  c.put(28, 13, C.steel1);
});
// Holowall tile: a translucent cyan block with shimmer scanlines.
tinyIcon(7, 6, (c) => {
  c.rect(2, 2, 28, 28, [0, 220, 238, 70]);
  c.outlineRect(2, 2, 28, 28, [120, 245, 255, 180]);
  c.line(3, 9, 28, 9, [176, 255, 255, 90]);
  c.line(3, 16, 28, 16, [176, 255, 255, 90]);
  c.line(3, 23, 28, 23, [176, 255, 255, 90]);
  c.line(9, 3, 9, 28, [176, 255, 255, 70]);
  c.line(16, 3, 16, 28, [176, 255, 255, 70]);
  c.line(23, 3, 23, 28, [176, 255, 255, 70]);
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

// Production environment family. Tile samples use their quiet central cluster
// so opposite edges remain seamless; props use alpha-trimmed authored bounds.
drawProductionTile(1, 0, 3, 0);
drawProductionCell(4, 0, environmentBoard, 3, 2, { padding: 1 });
drawProductionCell(5, 0, environmentBoard, 3, 2, { padding: 1 });
drawProductionTile(8, 0, 3, 0, 1);
drawProductionTile(9, 0, 3, 0, 2);
drawProductionTile(0, 4, 4, 0);
drawProductionTile(1, 4, 5, 0);
drawProductionTile(2, 4, 0, 0);
drawProductionTile(3, 4, 1, 0);
drawProductionTile(4, 4, 2, 0);
drawProductionTile(9, 9, 4, 0, 1);
drawProductionTile(10, 9, 5, 0, 1);
drawProductionTile(11, 9, 1, 0, 1);
drawProductionTile(12, 9, 1, 0, 2);
drawProductionTile(0, 17, 0, 0);
drawProductionTile(1, 17, 1, 0);
drawProductionTile(2, 17, 2, 0);
drawProductionTile(3, 17, 3, 0);
drawProductionTile(4, 17, 0, 1);
drawProductionTile(5, 17, 1, 1);
drawProductionTile(12, 17, 0, 0, 1);
drawProductionTile(13, 17, 2, 0, 1);
drawProductionTile(14, 17, 3, 0, 1);
drawProductionTile(15, 17, 0, 1, 1);

drawProductionCell(6, 8, environmentBoard, 1, 2, {
  cellsH: 2,
  padding: 1,
});
drawProductionCell(7, 8, environmentBoard, 2, 2, {
  cellsH: 2,
  padding: 1,
});
drawProductionCell(8, 8, environmentBoard, 1, 2, {
  cellsH: 2,
  padding: 1,
});
drawProductionCell(0, 10, environmentBoard, 5, 2, {
  cellsW: 2,
  cellsH: 3,
  padding: 2,
});
drawProductionCell(2, 10, environmentBoard, 5, 1, {
  cellsH: 2,
  padding: 1,
});
drawProductionCell(5, 10, environmentBoard, 0, 2, { padding: 0 });
drawProductionCell(4, 10, environmentBoard, 1, 2, {
  cellsH: 2,
  padding: 1,
});
drawProductionCell(8, 10, environmentBoard, 0, 3, {
  cellsH: 2,
  padding: 2,
});
drawProductionCell(9, 10, environmentBoard, 1, 3, { padding: 1 });
drawProductionCell(10, 10, environmentBoard, 2, 3, { padding: 2 });
drawProductionCell(11, 10, environmentBoard, 3, 3, { padding: 2 });
drawProductionCell(8, 18, environmentBoard, 2, 1, { padding: 0 });
drawProductionCell(9, 18, environmentBoard, 3, 2, { padding: 0 });
drawProductionCell(10, 18, environmentBoard, 4, 3, { padding: 0 });
drawProductionCell(11, 18, environmentBoard, 5, 3, { padding: 4 });
drawProductionCell(8, 20, environmentBoard, 5, 3, {
  cellsW: 3,
  cellsH: 3,
  padding: 2,
});
drawProductionCell(11, 20, environmentBoard, 4, 2, {
  cellsW: 2,
  cellsH: 2,
  padding: 1,
});
drawProductionCell(13, 20, environmentBoard, 5, 2, {
  cellsW: 2,
  cellsH: 3,
  padding: 2,
});

// Production character family. Repeated identity frames receive tiny offsets
// only where the source board intentionally supplies one pose.
for (const [atlasCol, sourceCol, offsetX] of [
  [0, 0, 0],
  [2, 0, -1],
  [3, 0, 1],
  [4, 1, 0],
  [5, 2, 0],
]) {
  drawProductionCell(atlasCol, 1, characterBoard, sourceCol, 0, {
    padding: 1,
    offsetX,
  });
}
drawProductionCell(6, 1, characterBoard, 3, 0, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(7, 1, characterBoard, 3, 0, {
  padding: 1,
  offsetX: 1,
});

drawProductionCell(10, 2, characterBoard, 0, 1, { padding: 2 });
drawProductionCell(11, 2, characterBoard, 1, 1, {
  padding: 2,
  offsetX: -1,
});
drawProductionCell(12, 2, characterBoard, 1, 1, {
  padding: 2,
  offsetX: 1,
});
drawProductionCell(1, 7, characterBoard, 4, 0, { padding: 2 });
drawProductionCell(2, 16, characterBoard, 5, 0, {
  padding: 2,
  offsetX: -1,
});
drawProductionCell(3, 16, characterBoard, 5, 0, {
  padding: 2,
  offsetX: 1,
});
drawProductionCell(5, 7, characterBoard, 2, 1, { padding: 1 });
drawProductionCell(10, 16, characterBoard, 3, 1, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(11, 16, characterBoard, 3, 1, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(0, 7, characterBoard, 4, 1, { padding: 1 });
drawProductionCell(0, 16, characterBoard, 5, 1, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(1, 16, characterBoard, 5, 1, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(1, 2, characterBoard, 0, 2, { padding: 3 });
drawProductionCell(8, 2, characterBoard, 0, 2, {
  padding: 3,
  offsetX: -1,
});
drawProductionCell(9, 2, characterBoard, 0, 2, {
  padding: 3,
  offsetX: 1,
});
drawProductionCell(4, 7, characterBoard, 1, 2, { padding: 4 });
drawProductionCell(8, 16, characterBoard, 1, 2, {
  padding: 4,
  offsetY: -1,
});
drawProductionCell(9, 16, characterBoard, 1, 2, {
  padding: 4,
  offsetY: 1,
});
drawProductionCell(2, 7, characterBoard, 2, 2, { padding: 2 });
drawProductionCell(4, 16, characterBoard, 2, 2, {
  padding: 2,
  offsetX: -1,
});
drawProductionCell(5, 16, characterBoard, 2, 2, {
  padding: 2,
  offsetX: 1,
});
drawProductionCell(10, 12, characterBoard, 3, 2, {
  cellsW: 2,
  cellsH: 2,
  padding: 2,
});
drawProductionCell(2, 14, characterBoard, 3, 2, {
  cellsW: 2,
  cellsH: 2,
  padding: 2,
  offsetX: 2,
});

drawProductionCell(0, 3, characterBoard, 4, 2, { padding: 6 });
drawProductionCell(2, 3, characterBoard, 0, 3, { padding: 5 });
drawProductionCell(3, 3, characterBoard, 2, 3, { padding: 6 });
drawProductionCell(7, 3, characterBoard, 1, 3, { padding: 5 });
drawProductionCell(8, 3, characterBoard, 1, 3, { padding: 5 });
drawProductionCell(12, 5, characterBoard, 3, 3, { padding: 6 });
drawProductionCell(3, 6, characterBoard, 5, 2, { padding: 4 });

drawProductionCell(0, 2, supplementalBoard, 0, 0, { padding: 1 });
drawProductionCell(6, 2, supplementalBoard, 1, 0, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(7, 2, supplementalBoard, 1, 0, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(3, 7, supplementalBoard, 2, 0, { padding: 1 });
drawProductionCell(6, 16, supplementalBoard, 3, 0, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(7, 16, supplementalBoard, 3, 0, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(6, 7, supplementalBoard, 4, 0, { padding: 1 });
drawProductionCell(12, 16, supplementalBoard, 5, 0, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(13, 16, supplementalBoard, 5, 0, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(7, 7, supplementalBoard, 0, 1, { padding: 1 });
drawProductionCell(14, 16, supplementalBoard, 1, 1, {
  padding: 1,
  offsetX: -1,
});
drawProductionCell(15, 16, supplementalBoard, 1, 1, {
  padding: 1,
  offsetX: 1,
});
drawProductionCell(8, 12, supplementalBoard, 2, 1, {
  cellsW: 2,
  cellsH: 2,
  padding: 2,
});
drawProductionCell(0, 14, supplementalBoard, 3, 1, {
  cellsW: 2,
  cellsH: 2,
  padding: 2,
  offsetX: 2,
});
drawProductionCell(9, 7, supplementalBoard, 4, 1, { padding: 1 });
drawProductionCell(4, 14, supplementalBoard, 5, 1, {
  padding: 1,
  offsetX: 1,
});

for (const [atlasCol, sourceCol] of [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
]) {
  drawProductionCell(atlasCol, 5, supplementalBoard, sourceCol, 2, {
    padding: 5,
  });
}
drawProductionCell(6, 5, supplementalBoard, 0, 3, { padding: 4 });
drawProductionCell(7, 5, supplementalBoard, 1, 3, { padding: 5 });
drawProductionCell(9, 5, supplementalBoard, 2, 3, { padding: 6 });
drawProductionCell(10, 5, supplementalBoard, 3, 3, { padding: 5 });
drawProductionCell(13, 5, supplementalBoard, 4, 3, { padding: 5 });
drawProductionCell(1, 6, supplementalBoard, 5, 3, { padding: 1 });

for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] === 0) continue;
  const replacement = LEGACY_TO_CURRENT.get(
    `${data[i]},${data[i + 1]},${data[i + 2]}`,
  );
  if (!replacement) continue;
  data[i] = replacement[0];
  data[i + 1] = replacement[1];
  data[i + 2] = replacement[2];
}

writeFileSync(OUT, encodePNG(W, H, data));
console.log(`spritesheet: ${W}x${H}, generated 2.5D atlas -> ${OUT}`);
