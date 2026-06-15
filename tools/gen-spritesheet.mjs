/**
 * Extend the spritesheet with procedural placeholder art for the new items and
 * monsters. Reads the pristine base (tools/sprites.base.png), grows the canvas,
 * copies the original art unchanged into the top rows, draws the new 32x32
 * sprites into the appended rows, and writes app/assets/img/sprites.png.
 *
 * Idempotent: always regenerates from the base, so re-running is safe. The art
 * is intentionally simple/iconographic — refine in art passes later. The cell
 * coordinates here MUST match NEW_SPRITE_CELLS in src/engine/config/sprites.ts.
 *
 *   node tools/gen-spritesheet.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePNG, encodePNG } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, "sprites.base.png");
const OUT = join(HERE, "..", "app", "assets", "img", "sprites.png");

const TILE = 32;
const COLS = 16;
const OUT_ROWS = 8; // base uses rows 0-4; new content fills rows 5-7

const base = decodePNG(readFileSync(BASE));
const W = base.width; // 512
const H = OUT_ROWS * TILE; // 256
const data = new Uint8Array(W * H * 4); // transparent canvas
// Copy the original art (rows 0-4) verbatim.
data.set(base.data.subarray(0, Math.min(base.data.length, W * H * 4)), 0);

// ---- tiny pixel-art helpers ------------------------------------------------
function cell(col, row) {
  const ox = col * TILE;
  const oy = row * TILE;
  const put = (x, y, [r, g, b, a = 255]) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = ((oy + y) * W + (ox + x)) * 4;
    // alpha-over onto whatever is there (transparent by default)
    const sa = a / 255;
    const da = data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / oa);
    data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / oa);
    data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / oa);
    data[i + 3] = Math.round(oa * 255);
  };
  const rect = (x, y, w, h, c) => {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, c);
  };
  const disc = (cx, cy, rad, c) => {
    for (let yy = -rad; yy <= rad; yy++)
      for (let xx = -rad; xx <= rad; xx++)
        if (xx * xx + yy * yy <= rad * rad) put(cx + xx, cy + yy, c);
  };
  const ring = (cx, cy, rad, c) => {
    for (let a = 0; a < 360; a += 6)
      put(
        Math.round(cx + Math.cos((a * Math.PI) / 180) * rad),
        Math.round(cy + Math.sin((a * Math.PI) / 180) * rad),
        c,
      );
  };
  const line = (x0, y0, x1, y1, c) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      put(x, y, c);
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
  return { put, rect, disc, ring, line };
}

// palette
const STEEL = [150, 160, 175];
const DARK = [40, 44, 54];
const BROWN = [120, 78, 40];
const GOLD = [235, 190, 60];
const CYAN = [90, 220, 230];
const RED = [200, 50, 50];
const GREEN = [90, 180, 80];
const TAN = [205, 165, 110];
const WHITE = [235, 235, 240];
const PURPLE = [150, 90, 190];
const YELLOW = [240, 220, 70];

// ---- the new sprites (cell coords must match sprites.ts) -------------------
const SPRITES = {
  // Row 5 — weapons & gear
  butcher_knife: [
    0,
    5,
    (c) => {
      c.line(8, 22, 22, 8, STEEL);
      c.rect(7, 21, 5, 5, BROWN);
      c.line(9, 20, 21, 9, [210, 220, 230]);
    },
  ],
  laser_pistol: [
    1,
    5,
    (c) => {
      c.rect(6, 14, 16, 6, [60, 90, 160]);
      c.rect(6, 19, 5, 8, [40, 60, 120]);
      c.rect(20, 15, 4, 2, CYAN);
      c.disc(23, 16, 1, CYAN);
    },
  ],
  gyrojet_smg: [
    2,
    5,
    (c) => {
      c.rect(6, 12, 18, 5, DARK);
      c.rect(8, 16, 5, 10, DARK);
      c.rect(18, 11, 3, 4, [90, 96, 110]);
    },
  ],
  gyrojet_shotgun: [
    3,
    5,
    (c) => {
      c.rect(4, 14, 22, 4, STEEL);
      c.rect(4, 18, 9, 4, BROWN);
    },
  ],
  macro_metal_sword: [
    4,
    5,
    (c) => {
      c.rect(15, 4, 2, 18, STEEL);
      c.rect(11, 21, 10, 2, [90, 96, 110]);
      c.rect(15, 23, 2, 5, BROWN);
    },
  ],
  vibra_sword: [
    5,
    5,
    (c) => {
      c.rect(15, 4, 2, 18, CYAN);
      c.rect(14, 4, 1, 18, [200, 255, 255]);
      c.rect(11, 21, 10, 2, STEEL);
      c.rect(15, 23, 2, 5, DARK);
    },
  ],
  macrometal_jacket: [
    6,
    5,
    (c) => {
      c.rect(10, 8, 12, 16, [80, 110, 150]);
      c.rect(7, 9, 4, 10, [80, 110, 150]);
      c.rect(21, 9, 4, 10, [80, 110, 150]);
      c.line(16, 8, 16, 24, [50, 70, 100]);
    },
  ],
  panic_button: [
    7,
    5,
    (c) => {
      c.rect(7, 12, 18, 12, [60, 60, 70]);
      c.disc(16, 18, 6, RED);
      c.disc(16, 18, 6, RED);
      c.ring(16, 18, 6, [120, 20, 20]);
    },
  ],
  holowall: [
    8,
    5,
    (c) => {
      c.rect(4, 6, 24, 20, [70, 200, 220, 110]);
      for (let y = 8; y < 26; y += 6) c.line(5, y, 27, y, [120, 230, 240, 150]);
      c.line(16, 6, 16, 26, [120, 230, 240, 150]);
    },
  ],
  bone: [
    9,
    5,
    (c) => {
      c.line(10, 12, 22, 20, WHITE);
      c.disc(10, 11, 2, WHITE);
      c.disc(11, 13, 2, WHITE);
      c.disc(22, 19, 2, WHITE);
      c.disc(21, 21, 2, WHITE);
    },
  ],
  cookie: [
    10,
    5,
    (c) => {
      c.disc(16, 16, 9, TAN);
      c.disc(12, 13, 1, [90, 60, 30]);
      c.disc(19, 14, 1, [90, 60, 30]);
      c.disc(15, 19, 1, [90, 60, 30]);
      c.disc(20, 19, 1, [90, 60, 30]);
    },
  ],
  black_pill: [
    11,
    5,
    (c) => {
      c.disc(13, 16, 5, [20, 20, 24]);
      c.disc(19, 16, 5, [40, 40, 48]);
      c.rect(13, 11, 6, 10, [28, 28, 34]);
    },
  ],
  coin: [
    12,
    5,
    (c) => {
      c.disc(16, 16, 8, GOLD);
      c.ring(16, 16, 8, [180, 140, 30]);
      c.rect(15, 12, 2, 8, [180, 140, 30]);
    },
  ],
  rock: [
    13,
    5,
    (c) => {
      c.disc(15, 18, 7, [110, 110, 118]);
      c.disc(19, 15, 4, [130, 130, 138]);
    },
  ],
  rubble_item: [
    14,
    5,
    (c) => {
      c.rect(8, 20, 6, 5, [120, 116, 110]);
      c.rect(15, 18, 6, 7, [140, 136, 128]);
      c.rect(20, 21, 5, 4, [110, 106, 100]);
    },
  ],
  trash: [
    15,
    5,
    (c) => {
      c.disc(16, 18, 7, [90, 110, 80]);
      c.rect(11, 12, 9, 6, [150, 140, 90]);
      c.line(12, 13, 18, 17, [80, 70, 50]);
    },
  ],
  // Row 6 — more items
  metal_scraps: [
    0,
    6,
    (c) => {
      c.line(8, 22, 16, 10, STEEL);
      c.line(16, 10, 22, 22, [120, 128, 140]);
      c.line(10, 18, 22, 18, [100, 108, 120]);
    },
  ],
  vending_machine: [
    1,
    6,
    (c) => {
      c.rect(8, 4, 16, 24, RED);
      c.rect(10, 6, 9, 12, [40, 50, 70]);
      c.rect(20, 7, 2, 3, GOLD);
      c.rect(20, 12, 2, 3, GOLD);
      c.rect(11, 22, 10, 3, [30, 30, 36]);
    },
  ],
  laser_bullet: [
    2,
    6,
    (c) => {
      c.disc(16, 16, 2, [180, 255, 200]);
      c.rect(12, 15, 8, 2, [120, 255, 160]);
    },
  ],
  // Row 7 — monsters
  giant_spider: [
    0,
    7,
    (c) => {
      c.disc(16, 17, 6, [30, 30, 38]);
      c.disc(16, 11, 3, [40, 40, 50]);
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++)
          c.line(16, 16, 16 + s * (10 + i), 9 + i * 6, [20, 20, 26]);
      c.put(15, 11, RED);
      c.put(17, 11, RED);
    },
  ],
  wild_dog: [
    1,
    7,
    (c) => {
      c.rect(9, 14, 14, 7, BROWN);
      c.rect(20, 10, 5, 5, BROWN);
      c.rect(8, 20, 2, 5, BROWN);
      c.rect(20, 20, 2, 5, BROWN);
      c.rect(7, 16, 3, 2, BROWN);
      c.put(23, 12, DARK);
    },
  ],
  icky_lump: [
    2,
    7,
    (c) => {
      c.disc(16, 19, 8, [90, 190, 90]);
      c.disc(13, 16, 3, [120, 210, 120]);
      c.put(13, 18, DARK);
      c.put(19, 18, DARK);
    },
  ],
  snagglepuss: [
    3,
    7,
    (c) => {
      c.disc(16, 17, 7, PURPLE);
      c.rect(12, 9, 2, 5, PURPLE);
      c.rect(19, 9, 2, 5, PURPLE);
      c.put(13, 16, WHITE);
      c.put(19, 16, WHITE);
      c.line(13, 21, 19, 21, [80, 40, 110]);
    },
  ],
  flutterbang: [
    4,
    7,
    (c) => {
      c.disc(16, 16, 4, [50, 40, 60]);
      c.line(12, 16, 4, 10, [70, 55, 80]);
      c.line(12, 16, 4, 22, [70, 55, 80]);
      c.line(20, 16, 28, 10, [70, 55, 80]);
      c.line(20, 16, 28, 22, [70, 55, 80]);
      c.put(14, 15, RED);
      c.put(18, 15, RED);
    },
  ],
  moppet: [
    5,
    7,
    (c) => {
      c.disc(16, 16, 9, YELLOW);
      c.disc(13, 14, 1, DARK);
      c.disc(19, 14, 1, DARK);
      for (let x = 12; x <= 20; x++)
        c.put(
          x,
          19 + Math.round(Math.sin(((x - 12) / 8) * Math.PI) * -2),
          DARK,
        );
    },
  ],
  cybercop: [
    6,
    7,
    (c) => {
      c.rect(12, 6, 8, 8, [90, 120, 160, 90]);
      c.rect(11, 14, 10, 12, [80, 110, 150, 90]);
      c.rect(13, 8, 6, 2, [150, 220, 255, 130]);
    },
  ],
  zyth: [
    7,
    7,
    (c) => {
      c.rect(12, 8, 8, 14, [70, 160, 90]);
      c.disc(16, 7, 4, [90, 190, 110]);
      c.put(14, 6, DARK);
      c.put(18, 6, DARK);
      c.rect(20, 14, 6, 2, DARK);
      c.disc(26, 15, 1, RED);
    },
  ],
  tentacular_horror: [
    8,
    7,
    (c) => {
      c.disc(16, 12, 8, [40, 150, 90]);
      c.put(13, 11, [10, 30, 20]);
      c.put(19, 11, [10, 30, 20]);
      for (let i = 0; i < 6; i++) c.line(16, 18, 6 + i * 4, 30, [40, 150, 90]);
    },
  ],
  terrorist_collaborator: [
    9,
    7,
    (c) => {
      c.disc(16, 9, 3, TAN);
      c.rect(12, 12, 8, 11, [110, 100, 70]);
      c.rect(18, 15, 9, 2, DARK);
      c.rect(11, 23, 3, 5, [70, 64, 44]);
      c.rect(18, 23, 3, 5, [70, 64, 44]);
    },
  ],
  dreadnaught: [
    10,
    7,
    (c) => {
      c.rect(6, 12, 20, 14, [70, 74, 84]);
      c.rect(8, 8, 12, 5, [90, 94, 104]);
      c.rect(20, 10, 8, 3, DARK);
      c.put(11, 10, RED);
      c.put(16, 10, RED);
      c.rect(7, 24, 18, 3, [40, 42, 50]);
    },
  ],
};

for (const [, [col, row, draw]] of Object.entries(SPRITES)) {
  draw(cell(col, row));
}

writeFileSync(OUT, encodePNG(W, H, data));
console.log(
  `✓ spritesheet: ${W}x${H}, +${Object.keys(SPRITES).length} sprites -> ${OUT}`,
);
