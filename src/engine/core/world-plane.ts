/**
 * Authoritative structure-of-arrays storage for one independently simulated
 * two-dimensional world plane.
 */

import { TileType } from "../types";
import { TileSource } from "./tile-source";

export interface WorldPlaneLayers {
  readonly ground: Uint16Array;
  readonly structure: Uint16Array;
  readonly fixture: Uint16Array;
  readonly elevation: Int16Array;
  readonly damage: Uint8Array;
}

export interface WorldCellSemantics {
  readonly tile: TileType;
  readonly passable: boolean;
  readonly opaque: boolean;
  readonly destructible: boolean;
}

export type WorldCellResolver = (
  layers: WorldPlaneLayers,
  index: number,
  x: number,
  y: number,
) => WorldCellSemantics;

export type WorldCellWriter = (
  layers: WorldPlaneLayers,
  index: number,
  tile: TileType,
) => void;

/** Allocate aligned typed arrays for a fixed-size plane. */
export function createWorldPlaneLayers(
  width: number,
  height: number,
): WorldPlaneLayers {
  const cellCount = width * height;
  return {
    ground: new Uint16Array(cellCount),
    structure: new Uint16Array(cellCount),
    fixture: new Uint16Array(cellCount),
    elevation: new Int16Array(cellCount),
    damage: new Uint8Array(cellCount),
  };
}

/**
 * A compositional plane that also satisfies current TileSource consumers.
 * `legacyTiles` is a derived projection, never an authoritative semantic layer.
 */
export class WorldPlane implements TileSource {
  private readonly legacyTileCache: TileType[];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly layers: WorldPlaneLayers,
    private readonly resolveCell: WorldCellResolver,
    private readonly writeCell?: WorldCellWriter,
  ) {
    const cellCount = width * height;
    for (const layer of Object.values(layers)) {
      if (layer.length !== cellCount) {
        throw new Error("WorldPlane layers must match width × height");
      }
    }
    this.legacyTileCache = new Array<TileType>(cellCount);
    this.refreshAll();
  }

  /** Derived scalar projection for systems not yet migrated to layer queries. */
  get legacyTiles(): TileType[] {
    return this.legacyTileCache;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  indexFor(x: number, y: number): number {
    return x + y * this.width;
  }

  semanticsAt(x: number, y: number): WorldCellSemantics {
    if (!this.inBounds(x, y)) {
      return {
        tile: TileType.WALL,
        passable: false,
        opaque: true,
        destructible: false,
      };
    }
    const index = this.indexFor(x, y);
    return this.resolveCell(this.layers, index, x, y);
  }

  getTile(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return TileType.WALL;
    return this.legacyTileCache[this.indexFor(x, y)];
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (!this.inBounds(x, y)) return;
    if (!this.writeCell) {
      throw new Error("This WorldPlane does not support scalar tile writes");
    }
    const index = this.indexFor(x, y);
    this.writeCell(this.layers, index, tile);
    this.refreshCell(index);
  }

  passable(x: number, y: number): boolean {
    return this.semanticsAt(x, y).passable;
  }

  opaque(x: number, y: number): boolean {
    return this.semanticsAt(x, y).opaque;
  }

  destructible(x: number, y: number): boolean {
    return this.semanticsAt(x, y).destructible;
  }

  /** Refresh one derived scalar cell after semantic layer mutation. */
  refreshCell(index: number): void {
    if (index < 0 || index >= this.legacyTileCache.length) return;
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    this.legacyTileCache[index] = this.resolveCell(
      this.layers,
      index,
      x,
      y,
    ).tile;
  }

  /** Refresh the complete derived projection after bulk generation/import. */
  refreshAll(): void {
    for (let index = 0; index < this.legacyTileCache.length; index++) {
      this.refreshCell(index);
    }
  }
}
