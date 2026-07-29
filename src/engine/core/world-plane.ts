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

/** A compositional plane that also satisfies current TileSource consumers. */
export class WorldPlane implements TileSource {
  private readonly resolvedTileCache: Uint16Array;

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
    this.resolvedTileCache = new Uint16Array(cellCount);
    this.refreshAllResolvedTiles();
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
    return this.resolvedTileCache[this.indexFor(x, y)] as TileType;
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (!this.inBounds(x, y)) return;
    if (!this.writeCell) {
      throw new Error("This WorldPlane does not support scalar tile writes");
    }
    const index = this.indexFor(x, y);
    this.writeCell(this.layers, index, tile);
    this.refreshResolvedTile(index);
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

  /** Refresh one presentation tile after a direct semantic-layer edit. */
  refreshResolvedTile(index: number): void {
    if (index < 0 || index >= this.resolvedTileCache.length) return;
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    this.resolvedTileCache[index] = this.resolveCell(
      this.layers,
      index,
      x,
      y,
    ).tile;
  }

  private refreshAllResolvedTiles(): void {
    for (let index = 0; index < this.resolvedTileCache.length; index++) {
      this.refreshResolvedTile(index);
    }
  }
}
