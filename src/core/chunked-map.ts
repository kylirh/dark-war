/**
 * Chunk-based, streamable tile storage.
 *
 * The world is divided into `CHUNK_SIZE × CHUNK_SIZE` chunks generated on
 * demand. This enables levels far larger than a single array, procedural
 * expansion as the player explores, and unloading distant chunks to cap memory
 * — without changing the consumer-facing `TileSource` contract.
 *
 * Generation is pure and deterministic (seeded by chunk coordinates), so an
 * unloaded chunk regenerates identically when revisited. Player/world edits
 * (destructible walls, opened doors) are stored separately as overrides so
 * they survive chunk eviction and always win over generated terrain.
 */

import { TileType } from "../types";
import { RandomNumberGenerator } from "../utils/rng";
import { TileSource, tileIsPassable } from "./tile-source";

export const CHUNK_SIZE = 16;

/** Produces the `CHUNK_SIZE²` tiles for the chunk at (chunkX, chunkY). */
export type ChunkGenerator = (chunkX: number, chunkY: number) => TileType[];

export interface ChunkedTileSourceOptions {
  /** Finite world width in tiles, or omit/`Infinity` for unbounded. */
  width?: number;
  /** Finite world height in tiles, or omit/`Infinity` for unbounded. */
  height?: number;
}

export class ChunkedTileSource implements TileSource {
  readonly width: number;
  readonly height: number;

  private readonly generate: ChunkGenerator;
  private readonly chunks = new Map<string, TileType[]>();
  // Edits keyed by absolute "x,y", applied over generated terrain. Persist
  // across chunk eviction so destruction/door state is never lost.
  private readonly overrides = new Map<string, TileType>();

  constructor(generator: ChunkGenerator, options: ChunkedTileSourceOptions = {}) {
    this.generate = generator;
    this.width = options.width ?? Infinity;
    this.height = options.height ?? Infinity;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTile(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return TileType.WALL;
    const override = this.overrides.get(key(x, y));
    if (override !== undefined) return override;
    const chunk = this.ensureChunk(chunkCoord(x), chunkCoord(y));
    return chunk[localIndex(x, y)];
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (!this.inBounds(x, y)) return;
    this.overrides.set(key(x, y), tile);
    // Keep a loaded chunk consistent so reads without the override map agree.
    const loaded = this.chunks.get(chunkKey(chunkCoord(x), chunkCoord(y)));
    if (loaded) loaded[localIndex(x, y)] = tile;
  }

  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return tileIsPassable(this.getTile(x, y));
  }

  // ── Streaming ────────────────────────────────────────────────────────────

  /** Load (generate if needed) the chunk at the given chunk coordinates. */
  ensureChunk(chunkX: number, chunkY: number): TileType[] {
    const k = chunkKey(chunkX, chunkY);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = this.generate(chunkX, chunkY);
      this.applyOverridesToChunk(chunkX, chunkY, chunk);
      this.chunks.set(k, chunk);
    }
    return chunk;
  }

  /** Ensure every chunk within `radius` chunks of a tile position is loaded. */
  ensureRegionAround(tileX: number, tileY: number, radius: number): void {
    const cx = chunkCoord(tileX);
    const cy = chunkCoord(tileY);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (this.chunkInBounds(nx, ny)) this.ensureChunk(nx, ny);
      }
    }
  }

  /** Evict chunks farther than `keepRadius` chunks from a tile position. */
  unloadFarChunks(tileX: number, tileY: number, keepRadius: number): void {
    const cx = chunkCoord(tileX);
    const cy = chunkCoord(tileY);
    for (const k of [...this.chunks.keys()]) {
      const [kx, ky] = parseChunkKey(k);
      if (Math.abs(kx - cx) > keepRadius || Math.abs(ky - cy) > keepRadius) {
        this.chunks.delete(k);
      }
    }
  }

  loadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Bake a rectangular region into a flat `TileType[]` (row-major) for interop
   * with code that still wants a plain array — e.g. building physics wall
   * bodies for the area around a player, or serializing a visible window.
   */
  materializeRegion(
    x0: number,
    y0: number,
    regionWidth: number,
    regionHeight: number,
  ): TileType[] {
    const out = new Array<TileType>(regionWidth * regionHeight);
    for (let ry = 0; ry < regionHeight; ry++) {
      for (let rx = 0; rx < regionWidth; rx++) {
        out[rx + ry * regionWidth] = this.getTile(x0 + rx, y0 + ry);
      }
    }
    return out;
  }

  private chunkInBounds(chunkX: number, chunkY: number): boolean {
    if (chunkX < 0 || chunkY < 0) return false;
    if (Number.isFinite(this.width) && chunkX * CHUNK_SIZE >= this.width) return false;
    if (Number.isFinite(this.height) && chunkY * CHUNK_SIZE >= this.height) return false;
    return true;
  }

  private applyOverridesToChunk(
    chunkX: number,
    chunkY: number,
    chunk: TileType[],
  ): void {
    if (this.overrides.size === 0) return;
    const baseX = chunkX * CHUNK_SIZE;
    const baseY = chunkY * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const override = this.overrides.get(key(baseX + lx, baseY + ly));
        if (override !== undefined) chunk[lx + ly * CHUNK_SIZE] = override;
      }
    }
  }
}

// ─── Coordinate helpers ──────────────────────────────────────────────────────

function chunkCoord(tile: number): number {
  return Math.floor(tile / CHUNK_SIZE);
}

function localIndex(x: number, y: number): number {
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return lx + ly * CHUNK_SIZE;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function chunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

function parseChunkKey(k: string): [number, number] {
  const comma = k.indexOf(",");
  return [Number(k.slice(0, comma)), Number(k.slice(comma + 1))];
}

// ─── Deterministic connected dungeon generator ───────────────────────────────

interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A chunk generator that composes guaranteed through-corridors, side rooms,
 * doors, closets, and small interior obstructions. The fixed edge midpoint
 * corridors keep neighbouring chunks connected regardless of generation order,
 * while each chunk's seeded layout varies independently.
 *
 * Seeding is derived purely from the chunk coordinates (and the world seed), so
 * generation is independent of call order and stable across eviction/reload.
 */
export function createDungeonChunkGenerator(worldSeed: number): ChunkGenerator {
  const mid = CHUNK_SIZE >> 1;

  return (chunkX: number, chunkY: number): TileType[] => {
    const tiles = new Array<TileType>(CHUNK_SIZE * CHUNK_SIZE).fill(TileType.WALL);
    const rng = new RandomNumberGenerator(chunkSeed(worldSeed, chunkX, chunkY));
    const junction = {
      x: clampLocal(mid + rng.int(5) - 2),
      y: clampLocal(mid + rng.int(5) - 2),
    };
    const rooms: LocalRect[] = [];
    const protectedTiles = new Set<number>();

    const set = (lx: number, ly: number, tile: TileType): void => {
      if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return;
      if (protectedTiles.has(lx + ly * CHUNK_SIZE) && tile !== TileType.FLOOR) return;
      tiles[lx + ly * CHUNK_SIZE] = tile;
    };
    const carve = (lx: number, ly: number, protect: boolean = false): void => {
      set(lx, ly, TileType.FLOOR);
      if (protect && lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE) {
        protectedTiles.add(lx + ly * CHUNK_SIZE);
      }
    };
    const tileAtLocal = (lx: number, ly: number): TileType => {
      if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return TileType.WALL;
      return tiles[lx + ly * CHUNK_SIZE];
    };
    const carveRect = (rect: LocalRect): void => {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) carve(x, y);
      }
      rooms.push(rect);
    };
    const carveHorizontal = (
      x1: number,
      x2: number,
      y: number,
      protect: boolean = false,
    ): void => {
      const start = Math.min(x1, x2);
      const end = Math.max(x1, x2);
      for (let x = start; x <= end; x++) carve(x, y, protect);
    };
    const carveVertical = (
      y1: number,
      y2: number,
      x: number,
      protect: boolean = false,
    ): void => {
      const start = Math.min(y1, y2);
      const end = Math.max(y1, y2);
      for (let y = start; y <= end; y++) carve(x, y, protect);
    };
    const carvePath = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      protect: boolean = false,
    ): void => {
      if (rng.chance(0.5)) {
        carveHorizontal(fromX, toX, fromY, protect);
        carveVertical(fromY, toY, toX, protect);
      } else {
        carveVertical(fromY, toY, fromX, protect);
        carveHorizontal(fromX, toX, toY, protect);
      }
    };

    // Stable trunk: the edge-midpoint crossings and chunk centre are always
    // floor, so streaming can place starts/stairs at local centre safely and
    // neighbours always line up at chunk borders.
    carvePath(mid, 0, junction.x, junction.y, true);
    carvePath(mid, CHUNK_SIZE - 1, junction.x, junction.y, true);
    carvePath(0, mid, junction.x, junction.y, true);
    carvePath(CHUNK_SIZE - 1, mid, junction.x, junction.y, true);
    carvePath(mid, mid, junction.x, junction.y, true);

    const archetype = rng.int(5);
    if (archetype === 0) {
      addConnectedRoom({ x: 3, y: 3, w: 7 + rng.int(4), h: 5 + rng.int(4) });
      addConnectedRoom(randomRoom(rng, 4, 4, 7, 6));
    } else if (archetype === 1) {
      addConnectedRoom({ x: 2, y: 2 + rng.int(3), w: 4 + rng.int(3), h: 8 + rng.int(4) });
      addConnectedRoom({ x: 10 - rng.int(2), y: 3 + rng.int(3), w: 4, h: 7 + rng.int(4) });
      addConnectedRoom(randomRoom(rng, 3, 3, 6, 5));
    } else if (archetype === 2) {
      addConnectedRoom({ x: 2, y: 2, w: 11, h: 5 + rng.int(3) });
      addConnectedRoom({ x: 3 + rng.int(2), y: 10, w: 9, h: 4 });
      carvePath(4, 10, 11, 6);
    } else if (archetype === 3) {
      addIrregularRoom(2 + rng.int(3), 2 + rng.int(3), 8 + rng.int(4), 8 + rng.int(4));
      addConnectedRoom(randomRoom(rng, 3, 3, 5, 5));
    } else {
      addConnectedRoom({ x: 4, y: 4, w: 8, h: 8 });
      addConnectedRoom({ x: 2, y: 2, w: 4, h: 4 });
      addConnectedRoom({ x: 10, y: 10, w: 4, h: 4 });
      addPillars({ x: 4, y: 4, w: 8, h: 8 });
    }

    // A few small closets/alcoves make chunks less boxy without jeopardizing
    // the trunk. They are intentionally door-heavy so exploration has beats.
    const closetCount = 1 + rng.int(3);
    for (let i = 0; i < closetCount; i++) {
      addConnectedRoom(randomRoom(rng, 2, 2, 4, 4));
    }

    for (const room of rooms) {
      maybePartitionRoom(room);
      maybeScatterObstructions(room);
    }

    return tiles;

    function addConnectedRoom(rect: LocalRect): void {
      const safeRect = clampRect(rect);
      carveRect(safeRect);
      const door = doorwayToward(safeRect, junction.x, junction.y);
      carvePath(junction.x, junction.y, door.x, door.y);
      maybeDoor(door.x, door.y);
    }

    function addIrregularRoom(x: number, y: number, w: number, h: number): void {
      const rect = clampRect({ x, y, w, h });
      carveRect(rect);
      const biteCount = 2 + rng.int(3);
      for (let i = 0; i < biteCount; i++) {
        const bx = rect.x + rng.int(rect.w);
        const by = rect.y + rng.int(rect.h);
        if (Math.abs(bx - mid) + Math.abs(by - mid) < 3) continue;
        set(bx, by, TileType.WALL);
      }
      const door = doorwayToward(rect, junction.x, junction.y);
      carvePath(junction.x, junction.y, door.x, door.y);
      maybeDoor(door.x, door.y);
    }

    function maybeDoor(lx: number, ly: number): void {
      if (lx <= 0 || ly <= 0 || lx >= CHUNK_SIZE - 1 || ly >= CHUNK_SIZE - 1) return;
      if (lx === mid && ly === mid) return;
      if (Math.abs(lx - junction.x) + Math.abs(ly - junction.y) <= 1) return;
      if (!rng.chance(0.78)) return;
      set(lx, ly, rng.chance(0.12) ? TileType.DOOR_LOCKED : TileType.DOOR_CLOSED);
    }

    function maybePartitionRoom(rect: LocalRect): void {
      if (!rng.chance(0.35)) return;
      if (rect.w >= 7 && rng.chance(0.5)) {
        const wallX = rect.x + 2 + rng.int(Math.max(1, rect.w - 4));
        const doorY = rect.y + 1 + rng.int(Math.max(1, rect.h - 2));
        for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) {
          if (y === doorY) continue;
          set(wallX, y, TileType.WALL);
        }
        set(wallX, doorY, rng.chance(0.5) ? TileType.DOOR_OPEN : TileType.DOOR_CLOSED);
      } else if (rect.h >= 7) {
        const wallY = rect.y + 2 + rng.int(Math.max(1, rect.h - 4));
        const doorX = rect.x + 1 + rng.int(Math.max(1, rect.w - 2));
        for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) {
          if (x === doorX) continue;
          set(x, wallY, TileType.WALL);
        }
        set(doorX, wallY, rng.chance(0.5) ? TileType.DOOR_OPEN : TileType.DOOR_CLOSED);
      }
    }

    function maybeScatterObstructions(rect: LocalRect): void {
      if (!rng.chance(0.5)) return;
      const count = rng.int(3);
      for (let i = 0; i < count; i++) {
        const x = rect.x + 1 + rng.int(Math.max(1, rect.w - 2));
        const y = rect.y + 1 + rng.int(Math.max(1, rect.h - 2));
        if (Math.abs(x - mid) + Math.abs(y - mid) < 3) continue;
        if (tileAtLocal(x, y) !== TileType.FLOOR) continue;
        set(x, y, rng.chance(0.35) ? TileType.RUBBLE : TileType.WALL);
      }
    }

    function addPillars(rect: LocalRect): void {
      for (const [x, y] of [
        [rect.x + 2, rect.y + 2],
        [rect.x + rect.w - 3, rect.y + 2],
        [rect.x + 2, rect.y + rect.h - 3],
        [rect.x + rect.w - 3, rect.y + rect.h - 3],
      ] as [number, number][]) {
        if (Math.abs(x - mid) + Math.abs(y - mid) >= 3) set(x, y, TileType.WALL);
      }
    }
  };
}

function randomRoom(
  rng: RandomNumberGenerator,
  minW: number,
  minH: number,
  maxW: number,
  maxH: number,
): LocalRect {
  const w = minW + rng.int(Math.max(1, maxW - minW + 1));
  const h = minH + rng.int(Math.max(1, maxH - minH + 1));
  return {
    x: 1 + rng.int(Math.max(1, CHUNK_SIZE - w - 2)),
    y: 1 + rng.int(Math.max(1, CHUNK_SIZE - h - 2)),
    w,
    h,
  };
}

function clampRect(rect: LocalRect): LocalRect {
  const w = Math.max(2, Math.min(rect.w, CHUNK_SIZE - 2));
  const h = Math.max(2, Math.min(rect.h, CHUNK_SIZE - 2));
  return {
    x: Math.max(1, Math.min(rect.x, CHUNK_SIZE - w - 1)),
    y: Math.max(1, Math.min(rect.y, CHUNK_SIZE - h - 1)),
    w,
    h,
  };
}

function doorwayToward(rect: LocalRect, targetX: number, targetY: number): { x: number; y: number } {
  const left = Math.abs(targetX - rect.x);
  const right = Math.abs(targetX - (rect.x + rect.w - 1));
  const top = Math.abs(targetY - rect.y);
  const bottom = Math.abs(targetY - (rect.y + rect.h - 1));
  const closest = Math.min(left, right, top, bottom);

  if (closest === left) {
    return { x: rect.x, y: Math.max(rect.y + 1, Math.min(targetY, rect.y + rect.h - 2)) };
  }
  if (closest === right) {
    return {
      x: rect.x + rect.w - 1,
      y: Math.max(rect.y + 1, Math.min(targetY, rect.y + rect.h - 2)),
    };
  }
  if (closest === top) {
    return { x: Math.max(rect.x + 1, Math.min(targetX, rect.x + rect.w - 2)), y: rect.y };
  }
  return {
    x: Math.max(rect.x + 1, Math.min(targetX, rect.x + rect.w - 2)),
    y: rect.y + rect.h - 1,
  };
}

function clampLocal(value: number): number {
  return Math.max(2, Math.min(CHUNK_SIZE - 3, value));
}

/** Order-independent seed for a chunk, mixing the world seed and coordinates. */
function chunkSeed(worldSeed: number, chunkX: number, chunkY: number): number {
  let h = worldSeed | 0;
  h = (Math.imul(h ^ (chunkX | 0), 0x85ebca6b)) | 0;
  h = (Math.imul(h ^ (chunkY | 0), 0xc2b2ae35)) | 0;
  h ^= h >>> 13;
  return h >>> 0;
}
