/**
 * Tile access abstraction.
 *
 * Today every level is a flat `TileType[]` of fixed `width × height`, accessed
 * through the `*For` helpers. That works but caps levels at whatever fits in a
 * single fully-loaded array. A `TileSource` decouples "how do I read/write the
 * tile at (x, y)" from "how are tiles stored", so the same consumers (FOV,
 * pathfinding, physics map build, generation) can run over either a flat array
 * or a streaming chunk store.
 *
 * `FlatTileSource` wraps the existing flat representation with identical
 * semantics (out-of-bounds reads return WALL, passability is TILE_DEFINITIONS
 * driven) so adopting the interface is a zero-behavior-change step. The
 * chunked, streamable implementation lives in `chunked-map.ts`.
 */

import { TileType, TILE_DEFINITIONS } from "../types";

export interface TileSource {
  /** Tile width of the world. May be `Infinity` for an unbounded source. */
  readonly width: number;
  /** Tile height of the world. May be `Infinity` for an unbounded source. */
  readonly height: number;
  /** Tile at (x, y); out-of-bounds reads return `TileType.WALL`. */
  getTile(x: number, y: number): TileType;
  /** Set the tile at (x, y); out-of-bounds writes are ignored. */
  setTile(x: number, y: number, tile: TileType): void;
  /** Whether (x, y) is inside the world. */
  inBounds(x: number, y: number): boolean;
  /** Whether (x, y) is in bounds and not a blocking tile. */
  passable(x: number, y: number): boolean;
}

/** Shared passability rule so every TileSource agrees with the helpers. */
export function tileIsPassable(tile: TileType): boolean {
  const def = TILE_DEFINITIONS[tile];
  return !!def && !def.block;
}

/**
 * A TileSource backed by the existing flat `TileType[]`. Semantics match the
 * `*For` helpers exactly so it can stand in anywhere without changing behavior.
 */
export class FlatTileSource implements TileSource {
  constructor(
    private readonly map: TileType[],
    readonly width: number,
    readonly height: number,
  ) {}

  /** The underlying array, for interop with code that still wants it raw. */
  get raw(): TileType[] {
    return this.map;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTile(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return TileType.WALL;
    return this.map[x + y * this.width];
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (!this.inBounds(x, y)) return;
    this.map[x + y * this.width] = tile;
  }

  passable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return tileIsPassable(this.getTile(x, y));
  }
}
