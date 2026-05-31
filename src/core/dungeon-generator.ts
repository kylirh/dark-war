/**
 * Whole-level dungeon generator.
 *
 * Generates a complete, bounded dungeon up front (rooms + corridors), as opposed
 * to the per-chunk streaming approach. Because levels are bounded, generating
 * globally lets us place varied rooms, carve organic cave pockets, and connect
 * everything with a minimum spanning tree *plus a few loops* — which reads far
 * less repetitive than a uniform grid of chunks.
 *
 * Deterministic: pass a seeded RandomNumberGenerator and the same seed yields
 * the same dungeon.
 */

import { TileType, WallSet } from "../types";
import { RandomNumberGenerator } from "../utils/rng";
import { idxFor, inBoundsFor, passableFor } from "../utils/helpers";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedDungeon {
  map: TileType[];
  width: number;
  height: number;
  start: [number, number];
  stairsDown: [number, number];
  rooms: Rect[];
  floorVariant: number;
  wallSet: WallSet;
}

const ROOM_PADDING = 1; // empty tiles required between rooms

export function generateDungeon(
  width: number,
  height: number,
  depth: number,
  rng: RandomNumberGenerator,
): GeneratedDungeon {
  const map = new Array<TileType>(width * height).fill(TileType.WALL);
  const set = (x: number, y: number, tile: TileType): void => {
    if (inBoundsFor(x, y, width, height)) map[idxFor(x, y, width)] = tile;
  };
  const get = (x: number, y: number): TileType =>
    inBoundsFor(x, y, width, height) ? map[idxFor(x, y, width)] : TileType.WALL;

  // ── 1. Place rooms ──────────────────────────────────────────────────────────
  const rooms: Rect[] = [];
  // Scale room count with area so big levels feel populated, not empty.
  const targetRooms = Math.round((width * height) / 220);
  const attempts = targetRooms * 12;
  for (let i = 0; i < attempts && rooms.length < targetRooms; i++) {
    const big = rng.chance(0.16);
    const w = big ? 9 + rng.int(9) : 4 + rng.int(7);
    const h = big ? 7 + rng.int(7) : 4 + rng.int(6);
    const x = 2 + rng.int(Math.max(1, width - w - 4));
    const y = 2 + rng.int(Math.max(1, height - h - 4));
    const rect: Rect = { x, y, w, h };
    if (rooms.some((other) => rectsOverlap(rect, other, ROOM_PADDING))) continue;
    rooms.push(rect);
    fillRect(set, rect, TileType.FLOOR);
  }

  // A few medium+ rooms become organic caves for visual variety.
  for (const room of rooms) {
    if (room.w >= 6 && room.h >= 6 && rng.chance(0.28)) {
      caveifyRoom(map, room, width, height, rng);
    }
  }

  if (rooms.length === 0) {
    // Degenerate fallback: one central room.
    const room: Rect = {
      x: Math.floor(width / 2) - 5,
      y: Math.floor(height / 2) - 4,
      w: 10,
      h: 8,
    };
    rooms.push(room);
    fillRect(set, room, TileType.FLOOR);
  }

  // ── 2. Connect rooms (MST + a few loops) ───────────────────────────────────
  const centers = rooms.map(roomCenter);
  for (const [a, b] of connectionEdges(centers, rng)) {
    carveCorridor(set, get, centers[a], centers[b], rng);
  }

  // ── 3. Doors where corridors pierce room walls ─────────────────────────────
  placeDoors(get, set, width, height, rng);

  // ── 4. Solid border so the player can't leave the level ────────────────────
  for (let x = 0; x < width; x++) {
    set(x, 0, TileType.WALL);
    set(x, height - 1, TileType.WALL);
  }
  for (let y = 0; y < height; y++) {
    set(0, y, TileType.WALL);
    set(width - 1, y, TileType.WALL);
  }

  // ── 5. Start + far-away down-stairs ────────────────────────────────────────
  const start = centers[0];
  let stairsRoom = 0;
  let bestDist = -1;
  for (let i = 1; i < centers.length; i++) {
    const d = manhattan(centers[i], start);
    if (d > bestDist) {
      bestDist = d;
      stairsRoom = i;
    }
  }
  const stairsDown = centers[stairsRoom] ?? start;
  set(start[0], start[1], TileType.FLOOR);
  set(stairsDown[0], stairsDown[1], TileType.STAIRS_DOWN);

  // `depth` is unused for now but kept in the signature so future generators can
  // theme levels (cave-heavy, larger, more loops) by how deep the player is.
  void depth;

  return {
    map,
    width,
    height,
    start,
    stairsDown,
    rooms,
    floorVariant: rng.int(3),
    wallSet: rng.chance(0.5) ? "wood" : "concrete",
  };
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  return !(
    a.x - pad >= b.x + b.w ||
    b.x - pad >= a.x + a.w ||
    a.y - pad >= b.y + b.h ||
    b.y - pad >= a.y + a.h
  );
}

function roomCenter(r: Rect): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}

function fillRect(
  set: (x: number, y: number, t: TileType) => void,
  r: Rect,
  tile: TileType,
): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) set(x, y, tile);
  }
}

/**
 * Run a couple of cellular-automata smoothing passes inside a room so its
 * outline becomes irregular/cave-like while keeping the centre open.
 */
function caveifyRoom(
  map: TileType[],
  room: Rect,
  width: number,
  height: number,
  rng: RandomNumberGenerator,
): void {
  const cx = Math.floor(room.x + room.w / 2);
  const cy = Math.floor(room.y + room.h / 2);

  // Seed interior walls randomly (edges biased solid, centre kept clear).
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) continue; // keep centre
      if (rng.chance(0.42)) map[idxFor(x, y, width)] = TileType.WALL;
    }
  }

  // Smooth: a tile becomes wall if most neighbours are walls.
  for (let pass = 0; pass < 3; pass++) {
    const snapshot = map.slice();
    const wallAt = (x: number, y: number): number =>
      !inBoundsFor(x, y, width, height) ||
      snapshot[idxFor(x, y, width)] === TileType.WALL
        ? 1
        : 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) continue;
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            walls += wallAt(x + dx, y + dy);
          }
        }
        map[idxFor(x, y, width)] =
          walls >= 5 ? TileType.WALL : TileType.FLOOR;
      }
    }
  }
}

// ─── Connectivity ────────────────────────────────────────────────────────────

/**
 * Minimum spanning tree over room centres (Prim's), plus a handful of extra
 * "loop" edges so the dungeon isn't a strict tree — loops make navigation and
 * combat far more interesting.
 */
function connectionEdges(
  centers: Array<[number, number]>,
  rng: RandomNumberGenerator,
): Array<[number, number]> {
  const n = centers.length;
  const edges: Array<[number, number]> = [];
  if (n <= 1) return edges;

  const inTree = new Array<boolean>(n).fill(false);
  inTree[0] = true;
  for (let added = 1; added < n; added++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let a = 0; a < n; a++) {
      if (!inTree[a]) continue;
      for (let b = 0; b < n; b++) {
        if (inTree[b]) continue;
        const d = manhattan(centers[a], centers[b]);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    inTree[best[1]] = true;
    edges.push(best);
  }

  // Extra loops: connect some random pairs of nearby rooms.
  const extra = Math.max(1, Math.round(n * 0.18));
  for (let i = 0; i < extra; i++) {
    const a = rng.int(n);
    let b = rng.int(n);
    if (a === b) b = (b + 1) % n;
    edges.push([a, b]);
  }

  return edges;
}

function carveCorridor(
  set: (x: number, y: number, t: TileType) => void,
  get: (x: number, y: number) => TileType,
  from: [number, number],
  to: [number, number],
  rng: RandomNumberGenerator,
): void {
  const carve = (x: number, y: number): void => {
    if (get(x, y) === TileType.WALL) set(x, y, TileType.FLOOR);
  };
  const hThenV = rng.chance(0.5);
  if (hThenV) {
    carveLine(carve, from[0], to[0], from[1], true);
    carveLine(carve, from[1], to[1], to[0], false);
  } else {
    carveLine(carve, from[1], to[1], from[0], false);
    carveLine(carve, from[0], to[0], to[1], true);
  }
}

function carveLine(
  carve: (x: number, y: number) => void,
  a: number,
  b: number,
  fixed: number,
  horizontal: boolean,
): void {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  for (let i = start; i <= end; i++) {
    if (horizontal) carve(i, fixed);
    else carve(fixed, i);
  }
}

// ─── Doors ───────────────────────────────────────────────────────────────────

/**
 * Place doors where a 1-wide corridor passes through a wall between two open
 * tiles (a floor-wall-floor pinch in exactly one axis).
 */
function placeDoors(
  get: (x: number, y: number) => TileType,
  set: (x: number, y: number, t: TileType) => void,
  width: number,
  height: number,
  rng: RandomNumberGenerator,
): void {
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (get(x, y) !== TileType.WALL) continue;
      const horizontal =
        get(x - 1, y) === TileType.FLOOR && get(x + 1, y) === TileType.FLOOR;
      const vertical =
        get(x, y - 1) === TileType.FLOOR && get(x, y + 1) === TileType.FLOOR;
      // A doorway is a pinch in exactly one direction.
      if (horizontal === vertical) continue;
      if (!rng.chance(0.22)) continue;
      set(x, y, rng.chance(0.82) ? TileType.DOOR_CLOSED : TileType.DOOR_LOCKED);
    }
  }
}

// ─── Misc ────────────────────────────────────────────────────────────────────

function manhattan(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/** Exported for tests: a flood fill confirming the level is fully connected. */
export function reachableFloorCount(
  map: TileType[],
  width: number,
  height: number,
  from: [number, number],
): number {
  const visited = new Set<number>();
  const queue: Array<[number, number]> = [from];
  visited.add(idxFor(from[0], from[1], width));
  let count = 0;
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as Array<[number, number]>) {
      const nx = x + dx;
      const ny = y + dy;
      if (!passableFor(map, nx, ny, width, height)) continue;
      const k = idxFor(nx, ny, width);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }
  return count;
}
