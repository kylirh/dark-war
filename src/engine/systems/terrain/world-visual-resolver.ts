/** Deterministic, bounded visual classification for production WorldPlanes. */

import { WorldPlane } from "../../core/world-plane";
import { TileType } from "../../types";
import { cardinalAutotileMask } from "../../utils/autotile";
import {
  cliffMagnitudeForDrop,
  resolveElevationVisualContext,
} from "./elevation-resolver";
import { resolveBlobTransitionMask } from "./terrain-transition-resolver";

export enum ResolvedCliffMagnitude {
  NONE,
  STEP,
  TALL,
}

export interface WorldVisualLayers {
  readonly coordinateHash: Uint32Array;
  readonly groundMask: Uint8Array;
  readonly wallMask: Uint8Array;
  readonly holeMask: Uint8Array;
  readonly shoreMask: Uint8Array;
  readonly lowerElevationMask: Uint8Array;
  readonly higherElevationMask: Uint8Array;
  readonly cliffMagnitude: Uint8Array;
}

export interface WorldVisualResolverOptions {
  readonly wraps?: boolean;
  readonly variantSeed?: number;
  readonly waterGroundIds?: readonly number[];
}

/** Stable integer hash: identical semantic coordinates resolve identically. */
export function hashWorldVisualCoordinate(
  x: number,
  y: number,
  seed = 0,
): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (y + 0x9e3779b9), 0x45d9f3b);
  value ^= value >>> 16;
  return value >>> 0;
}

/** Mix a cached coordinate hash for independent decoration families. */
export function mixWorldVisualHash(hash: number, salt: number): number {
  let value = hash ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function allocateVisualLayers(cellCount: number): WorldVisualLayers {
  return {
    coordinateHash: new Uint32Array(cellCount),
    groundMask: new Uint8Array(cellCount),
    wallMask: new Uint8Array(cellCount),
    holeMask: new Uint8Array(cellCount),
    shoreMask: new Uint8Array(cellCount),
    lowerElevationMask: new Uint8Array(cellCount),
    higherElevationMask: new Uint8Array(cellCount),
    cliffMagnitude: new Uint8Array(cellCount),
  };
}

function isWallConnection(tile: TileType): boolean {
  return (
    tile === TileType.WALL ||
    tile === TileType.DOOR_CLOSED ||
    tile === TileType.DOOR_OPEN ||
    tile === TileType.DOOR_LOCKED
  );
}

/** Derived visual state. It never participates in simulation or serialization. */
export class WorldVisualState {
  readonly layers: WorldVisualLayers;
  revision = 0;
  lastDirtyIndices: readonly number[] = [];

  private readonly wraps: boolean;
  private readonly variantSeed: number;
  private readonly waterGroundIds: ReadonlySet<number>;

  constructor(
    private readonly plane: WorldPlane,
    options: WorldVisualResolverOptions = {},
  ) {
    this.wraps = options.wraps ?? false;
    this.variantSeed = options.variantSeed ?? 0;
    this.waterGroundIds = new Set(options.waterGroundIds ?? []);
    this.layers = allocateVisualLayers(plane.width * plane.height);
    this.refreshAll();
  }

  /** Re-resolve the bounded 3x3 dependency area around one semantic edit. */
  refreshNeighborhood(x: number, y: number): readonly number[] {
    const dirty = new Set<number>();
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const sample = this.normalizeCoordinate(x + offsetX, y + offsetY);
        if (!sample) continue;
        dirty.add(this.plane.indexFor(sample[0], sample[1]));
      }
    }
    const indices = Array.from(dirty).sort((a, b) => a - b);
    for (const index of indices) this.refreshIndex(index);
    this.lastDirtyIndices = indices;
    this.revision++;
    return indices;
  }

  private refreshAll(): void {
    for (let index = 0; index < this.plane.width * this.plane.height; index++) {
      this.refreshIndex(index);
    }
  }

  private refreshIndex(index: number): void {
    const x = index % this.plane.width;
    const y = Math.floor(index / this.plane.width);
    const ground = this.plane.layers.ground[index];
    const tileAt = (sampleX: number, sampleY: number): TileType | null => {
      const sample = this.normalizeCoordinate(sampleX, sampleY);
      return sample ? this.plane.getTile(sample[0], sample[1]) : null;
    };
    const groundAt = (sampleX: number, sampleY: number): number | null => {
      const sample = this.normalizeCoordinate(sampleX, sampleY);
      return sample
        ? this.plane.layers.ground[this.plane.indexFor(sample[0], sample[1])]
        : null;
    };
    const elevationAt = (sampleX: number, sampleY: number): number => {
      const sample = this.normalizeCoordinate(sampleX, sampleY);
      return sample
        ? this.plane.layers.elevation[this.plane.indexFor(sample[0], sample[1])]
        : this.plane.layers.elevation[index];
    };

    this.layers.coordinateHash[index] = hashWorldVisualCoordinate(
      x,
      y,
      this.variantSeed,
    );
    this.layers.groundMask[index] = resolveBlobTransitionMask(
      x,
      y,
      (sampleX, sampleY) => groundAt(sampleX, sampleY) === ground,
    );
    this.layers.wallMask[index] = cardinalAutotileMask(
      x,
      y,
      (sampleX, sampleY) => {
        const tile = tileAt(sampleX, sampleY);
        return tile !== null && isWallConnection(tile);
      },
    );
    this.layers.holeMask[index] = cardinalAutotileMask(
      x,
      y,
      (sampleX, sampleY) => tileAt(sampleX, sampleY) === TileType.HOLE,
    );
    this.layers.shoreMask[index] = resolveBlobTransitionMask(
      x,
      y,
      (sampleX, sampleY) => {
        const sampleGround = groundAt(sampleX, sampleY);
        return sampleGround !== null && this.waterGroundIds.has(sampleGround);
      },
    );

    const elevation = resolveElevationVisualContext(x, y, elevationAt);
    this.layers.lowerElevationMask[index] = elevation.lowerNeighborMask;
    this.layers.higherElevationMask[index] = elevation.higherNeighborMask;
    const magnitude = cliffMagnitudeForDrop(elevation.maximumDrop);
    this.layers.cliffMagnitude[index] =
      magnitude === "tall"
        ? ResolvedCliffMagnitude.TALL
        : magnitude === "step"
          ? ResolvedCliffMagnitude.STEP
          : ResolvedCliffMagnitude.NONE;
  }

  private normalizeCoordinate(x: number, y: number): [number, number] | null {
    if (this.wraps) {
      return [
        ((x % this.plane.width) + this.plane.width) % this.plane.width,
        ((y % this.plane.height) + this.plane.height) % this.plane.height,
      ];
    }
    return this.plane.inBounds(x, y) ? [x, y] : null;
  }
}
