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

/**
 * A chunk generator that carves a room in each chunk and corridors out to the
 * midpoint of every chunk edge. Because edge midpoints are at fixed local
 * coordinates, a chunk's corridor lines up with its neighbour's opposing
 * corridor, so the grid of chunks is fully connected regardless of the order
 * chunks are generated in.
 *
 * Seeding is derived purely from the chunk coordinates (and the world seed), so
 * generation is independent of call order and stable across eviction/reload.
 */
export function createDungeonChunkGenerator(worldSeed: number): ChunkGenerator {
  const mid = CHUNK_SIZE >> 1;

  return (chunkX: number, chunkY: number): TileType[] => {
    const tiles = new Array<TileType>(CHUNK_SIZE * CHUNK_SIZE).fill(TileType.WALL);
    const rng = new RandomNumberGenerator(chunkSeed(worldSeed, chunkX, chunkY));

    const carve = (lx: number, ly: number): void => {
      if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return;
      tiles[lx + ly * CHUNK_SIZE] = TileType.FLOOR;
    };

    // Central room, randomly sized but always covering the chunk centre.
    const roomHalfW = 2 + rng.int(mid - 2);
    const roomHalfH = 2 + rng.int(mid - 2);
    for (let ly = mid - roomHalfH; ly <= mid + roomHalfH; ly++) {
      for (let lx = mid - roomHalfW; lx <= mid + roomHalfW; lx++) {
        carve(lx, ly);
      }
    }

    // Corridors from the centre to each edge midpoint (connects neighbours).
    for (let lx = 0; lx <= mid; lx++) carve(lx, mid); // west
    for (let lx = mid; lx < CHUNK_SIZE; lx++) carve(lx, mid); // east
    for (let ly = 0; ly <= mid; ly++) carve(mid, ly); // north
    for (let ly = mid; ly < CHUNK_SIZE; ly++) carve(mid, ly); // south

    return tiles;
  };
}

/** Order-independent seed for a chunk, mixing the world seed and coordinates. */
function chunkSeed(worldSeed: number, chunkX: number, chunkY: number): number {
  let h = worldSeed | 0;
  h = (Math.imul(h ^ (chunkX | 0), 0x85ebca6b)) | 0;
  h = (Math.imul(h ^ (chunkY | 0), 0xc2b2ae35)) | 0;
  h ^= h >>> 13;
  return h >>> 0;
}
