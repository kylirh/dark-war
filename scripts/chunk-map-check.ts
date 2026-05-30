/**
 * Tests for the chunk-based map subsystem.
 * Run: npx tsx scripts/chunk-map-check.ts
 */
import { TileType } from "../src/types";
import { tileAtFor, passableFor, inBoundsFor } from "../src/utils/helpers";
import { FlatTileSource } from "../src/core/tile-source";
import {
  ChunkedTileSource,
  createDungeonChunkGenerator,
  CHUNK_SIZE,
} from "../src/core/chunked-map";

let failures = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`ok   ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}${detail ? ": " + detail : ""}`);
  }
}

// ── FlatTileSource parity with the existing helpers ──────────────────────────
{
  const W = 12;
  const H = 9;
  const map = new Array(W * H);
  // Deterministic-ish mix of tile types.
  const palette = [TileType.WALL, TileType.FLOOR, TileType.DOOR_CLOSED, TileType.DOOR_OPEN, TileType.HOLE];
  for (let i = 0; i < map.length; i++) map[i] = palette[(i * 7) % palette.length];

  const src = new FlatTileSource(map, W, H);
  let parity = true;
  for (let y = -1; y <= H; y++) {
    for (let x = -1; x <= W; x++) {
      if (src.inBounds(x, y) !== inBoundsFor(x, y, W, H)) parity = false;
      if (src.getTile(x, y) !== tileAtFor(map, x, y, W, H)) parity = false;
      if (src.passable(x, y) !== passableFor(map, x, y, W, H)) parity = false;
    }
  }
  assert("flat-parity", parity, "FlatTileSource diverged from *For helpers");

  src.setTile(3, 3, TileType.STAIRS_DOWN);
  assert("flat-setTile", map[3 + 3 * W] === TileType.STAIRS_DOWN, "setTile didn't write through");
}

// ── ChunkedTileSource: determinism, connectivity, edits, streaming ───────────
{
  const seed = 12345;
  const gen = createDungeonChunkGenerator(seed);

  const a = new ChunkedTileSource(gen);
  const b = new ChunkedTileSource(gen);

  // Determinism: two independent sources agree everywhere sampled, regardless
  // of the order chunks are first touched.
  let deterministic = true;
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < 200; i++) coords.push([(i * 13) % 80 - 8, (i * 29) % 80 - 8]);
  // Touch in different orders.
  for (const [x, y] of coords) a.getTile(x, y);
  for (let i = coords.length - 1; i >= 0; i--) b.getTile(coords[i][0], coords[i][1]);
  for (const [x, y] of coords) {
    if (a.getTile(x, y) !== b.getTile(x, y)) deterministic = false;
  }
  assert("chunk-determinism", deterministic, "same seed produced different tiles");

  // Connectivity: shared edge midpoints between neighbouring chunks are both
  // floor, so adjacent chunks connect.
  const mid = CHUNK_SIZE >> 1;
  let connected = true;
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      // East seam between (cx,cy) and (cx+1,cy).
      const ex = cx * CHUNK_SIZE + (CHUNK_SIZE - 1);
      const ey = cy * CHUNK_SIZE + mid;
      if (!a.passable(ex, ey) || !a.passable(ex + 1, ey)) connected = false;
      // South seam between (cx,cy) and (cx,cy+1).
      const sx = cx * CHUNK_SIZE + mid;
      const sy = cy * CHUNK_SIZE + (CHUNK_SIZE - 1);
      if (!a.passable(sx, sy) || !a.passable(sx, sy + 1)) connected = false;
    }
  }
  assert("chunk-connectivity", connected, "chunk seams were not passable on both sides");

  // Edits survive eviction: set a tile, unload its chunk, read it back.
  const editX = 40;
  const editY = 40;
  a.setTile(editX, editY, TileType.STAIRS_UP);
  a.unloadFarChunks(0, 0, 0); // evict everything except chunk (0,0)
  assert(
    "edit-survives-eviction",
    a.getTile(editX, editY) === TileType.STAIRS_UP,
    "override lost after chunk eviction",
  );

  // Streaming load/unload bounds the loaded chunk set.
  const s = new ChunkedTileSource(gen);
  s.ensureRegionAround(100, 100, 2); // 5x5 = 25 chunks
  assert("stream-load", s.loadedChunkCount() === 25, `loaded ${s.loadedChunkCount()} expected 25`);
  s.unloadFarChunks(100, 100, 1); // keep 3x3 = 9
  assert("stream-unload", s.loadedChunkCount() === 9, `kept ${s.loadedChunkCount()} expected 9`);

  // Bounded source: out of bounds reads are WALL.
  const bounded = new ChunkedTileSource(gen, { width: 32, height: 32 });
  assert("bounded-oob", bounded.getTile(40, 5) === TileType.WALL && !bounded.inBounds(40, 5), "OOB not WALL");

  // materializeRegion round-trips against getTile.
  let baked = true;
  const region = s.materializeRegion(20, 20, 8, 6);
  for (let ry = 0; ry < 6; ry++) {
    for (let rx = 0; rx < 8; rx++) {
      if (region[rx + ry * 8] !== s.getTile(20 + rx, 20 + ry)) baked = false;
    }
  }
  assert("materialize-region", baked, "baked region diverged from getTile");
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
