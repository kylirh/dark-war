/**
 * Authoritative structure-of-arrays storage for one independently simulated
 * two-dimensional world plane.
 */

import { TileType } from "../types";
import { TileSource } from "./tile-source";
import type { WorldVisualState } from "../systems/terrain/world-visual-resolver";

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

export interface WorldCellLayerEdit {
  readonly ground?: number;
  readonly structure?: number;
  readonly fixture?: number;
  readonly elevation?: number;
  readonly damage?: number;
}

export type WorldTraversalResolver = (
  layers: WorldPlaneLayers,
  fromIndex: number,
  toIndex: number,
  deltaX: number,
  deltaY: number,
) => boolean;

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
  private visualState?: WorldVisualState;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly layers: WorldPlaneLayers,
    private readonly resolveCell: WorldCellResolver,
    private readonly writeCell?: WorldCellWriter,
    private readonly resolveTraversal?: WorldTraversalResolver,
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

  get visuals(): WorldVisualState | undefined {
    return this.visualState;
  }

  attachVisualState(visualState: WorldVisualState): void {
    this.visualState = visualState;
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
    this.visualState?.refreshNeighborhood(x, y);
  }

  passable(x: number, y: number): boolean {
    return this.semanticsAt(x, y).passable;
  }

  canTraverse(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (!this.inBounds(fromX, fromY) || !this.inBounds(toX, toY)) return false;
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1) return false;
    const fromIndex = this.indexFor(fromX, fromY);
    const toIndex = this.indexFor(toX, toY);
    if (this.resolveTraversal) {
      return this.resolveTraversal(
        this.layers,
        fromIndex,
        toIndex,
        deltaX,
        deltaY,
      );
    }
    return (
      this.passable(toX, toY) &&
      this.layers.elevation[fromIndex] === this.layers.elevation[toIndex]
    );
  }

  /** Apply one compositional cell edit and refresh all bounded derived state. */
  editCell(x: number, y: number, edit: WorldCellLayerEdit): readonly number[] {
    if (!this.inBounds(x, y)) return [];
    const index = this.indexFor(x, y);
    if (edit.ground !== undefined) this.layers.ground[index] = edit.ground;
    if (edit.structure !== undefined)
      this.layers.structure[index] = edit.structure;
    if (edit.fixture !== undefined) this.layers.fixture[index] = edit.fixture;
    if (edit.elevation !== undefined) {
      this.layers.elevation[index] = Math.max(
        -32768,
        Math.min(32767, Math.trunc(edit.elevation)),
      );
    }
    if (edit.damage !== undefined) {
      this.layers.damage[index] = Math.max(
        0,
        Math.min(255, Math.trunc(edit.damage)),
      );
    }
    this.refreshResolvedTile(index);
    return this.visualState?.refreshNeighborhood(x, y) ?? [index];
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
