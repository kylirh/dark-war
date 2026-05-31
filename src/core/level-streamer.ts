/**
 * Lazy, streaming dungeon generation.
 *
 * A streamed dungeon is a bounded-but-large flat map that starts as solid wall
 * and fills in `CHUNK_SIZE`-sized chunks of connected rooms/corridors as players
 * approach. Because the backing store stays a finite `TileType[]`, everything
 * downstream — serialization, explored/wall-damage indices, FOV, physics,
 * rendering — keeps working unchanged; the world simply materializes around the
 * player instead of being generated all at once.
 *
 * Connectivity is guaranteed by the chunk generator (corridors to every edge
 * midpoint line up with neighbours), so the player can always walk into a
 * freshly generated chunk. Generation is deterministic from the level seed.
 */

import { TileType } from "../types";
import { idxFor } from "../utils/helpers";
import {
  CHUNK_SIZE,
  ChunkGenerator,
  createDungeonChunkGenerator,
} from "./chunked-map";

export interface StreamResult {
  /** Flat tile indices whose value changed this pass (for physics + deltas). */
  changed: number[];
  /** Chunk coords generated this pass (for spawning monsters/items into them). */
  newChunks: Array<[number, number]>;
}

export class LevelStreamer {
  private readonly generated = new Set<string>();
  private readonly genChunk: ChunkGenerator;

  constructor(
    seed: number,
    readonly width: number,
    readonly height: number,
    private readonly stairsUp: [number, number] | null,
    private readonly stairsDown: [number, number] | null,
  ) {
    this.genChunk = createDungeonChunkGenerator(seed);
  }

  isChunkGenerated(chunkX: number, chunkY: number): boolean {
    return this.generated.has(`${chunkX},${chunkY}`);
  }

  loadedChunkCount(): number {
    return this.generated.size;
  }

  /**
   * Generate any not-yet-generated chunks within `chunkRadius` chunks of the
   * tile position, writing carved floor (and stairs) into `map`.
   */
  ensureAround(
    map: TileType[],
    tileX: number,
    tileY: number,
    chunkRadius: number,
  ): StreamResult {
    const result: StreamResult = { changed: [], newChunks: [] };
    const ccx = Math.floor(tileX / CHUNK_SIZE);
    const ccy = Math.floor(tileY / CHUNK_SIZE);
    for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
      for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
        const cx = ccx + dx;
        const cy = ccy + dy;
        if (!this.chunkInBounds(cx, cy)) continue;
        const k = `${cx},${cy}`;
        if (this.generated.has(k)) continue;
        this.generated.add(k);
        this.writeChunk(map, cx, cy, result.changed);
        result.newChunks.push([cx, cy]);
      }
    }
    return result;
  }

  /**
   * Rebuild the generated-chunk set from an already-populated map (a chunk
   * counts as generated if it contains any non-wall tile). Used after a level is
   * restored from a snapshot/save so we don't re-carve what already exists.
   */
  markGeneratedFromMap(map: TileType[]): void {
    const chunksX = Math.ceil(this.width / CHUNK_SIZE);
    const chunksY = Math.ceil(this.height / CHUNK_SIZE);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        if (this.chunkHasFloor(map, cx, cy)) this.generated.add(`${cx},${cy}`);
      }
    }
  }

  private chunkHasFloor(map: TileType[], cx: number, cy: number): boolean {
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = baseX + lx;
        const y = baseY + ly;
        if (x >= this.width || y >= this.height) continue;
        if (map[idxFor(x, y, this.width)] !== TileType.WALL) return true;
      }
    }
    return false;
  }

  private writeChunk(map: TileType[], cx: number, cy: number, changed: number[]): void {
    const tiles = this.genChunk(cx, cy);
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = baseX + lx;
        const y = baseY + ly;
        // Keep the outer world border solid so the player can't leave the level.
        if (x <= 0 || y <= 0 || x >= this.width - 1 || y >= this.height - 1) continue;
        const generatedTile = tiles[lx + ly * CHUNK_SIZE];
        if (generatedTile === TileType.WALL) continue;
        const i = idxFor(x, y, this.width);
        if (map[i] !== generatedTile) {
          map[i] = generatedTile;
          changed.push(i);
        }
      }
    }
    this.placeStair(map, cx, cy, this.stairsUp, TileType.STAIRS_UP, changed);
    this.placeStair(map, cx, cy, this.stairsDown, TileType.STAIRS_DOWN, changed);
  }

  private placeStair(
    map: TileType[],
    cx: number,
    cy: number,
    pos: [number, number] | null,
    tile: TileType,
    changed: number[],
  ): void {
    if (!pos) return;
    if (Math.floor(pos[0] / CHUNK_SIZE) !== cx || Math.floor(pos[1] / CHUNK_SIZE) !== cy) {
      return;
    }
    const i = idxFor(pos[0], pos[1], this.width);
    // Make sure the stairs sit on carved floor and are reachable.
    map[i] = tile;
    if (!changed.includes(i)) changed.push(i);
  }

  private chunkInBounds(chunkX: number, chunkY: number): boolean {
    return (
      chunkX >= 0 &&
      chunkY >= 0 &&
      chunkX * CHUNK_SIZE < this.width &&
      chunkY * CHUNK_SIZE < this.height
    );
  }
}
