/**
 * Tile access abstraction.
 *
 * `TileSource` keeps FOV, pathfinding, physics, generation, and rendering
 * independent of the compositional `WorldPlane` implementation.
 *
 * `FlatTileSource` wraps the existing flat representation with identical
 * semantics (out-of-bounds reads return WALL, passability is TILE_DEFINITIONS
 * driven). Production worlds use `WorldPlane`; this adapter remains useful for
 * small isolated unit-test fixtures.
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
  /** Whether (x, y) blocks sight. */
  opaque(x: number, y: number): boolean;
  /** Whether an actor can cross directly between neighboring cells. */
  canTraverse(fromX: number, fromY: number, toX: number, toY: number): boolean;
}

/** Shared passability rule so every TileSource agrees with the helpers. */
export function tileIsPassable(tile: TileType): boolean {
  const def = TILE_DEFINITIONS[tile];
  return !!def && !def.block;
}

/** Walls and doors — the solid/gating tiles, as opposed to floor or holes. */
export function isWallLikeTile(tile: TileType): boolean {
  return (
    tile === TileType.WALL ||
    tile === TileType.HOLOWALL ||
    tile === TileType.DOOR_CLOSED ||
    tile === TileType.DOOR_OPEN ||
    tile === TileType.DOOR_LOCKED
  );
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

  opaque(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return TILE_DEFINITIONS[this.getTile(x, y)]?.opaque ?? true;
  }

  canTraverse(
    _fromX: number,
    _fromY: number,
    toX: number,
    toY: number,
  ): boolean {
    return this.passable(toX, toY);
  }
}
