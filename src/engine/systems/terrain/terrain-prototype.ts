/**
 * Deterministic Milestone 1 terrain slice.
 *
 * This development fixture proves compositional layers, signed elevation,
 * static water, authored structures, and legacy collision interop before the
 * scalar map is replaced globally. It is never serialized as production data.
 */

import { TileType } from "../../types";
import {
  cliffMagnitudeForDrop,
  ELEVATION_EAST,
  ELEVATION_NORTH,
  ELEVATION_SOUTH,
  ELEVATION_WEST,
  resolveElevationVisualContext,
} from "./elevation-resolver";

export const TERRAIN_PROTOTYPE_WIDTH = 40;
export const TERRAIN_PROTOTYPE_HEIGHT = 30;
export const TERRAIN_LOWER_FIXTURE = [22, 14] as const;
export const TERRAIN_RAISE_FIXTURE = [23, 14] as const;

export enum PrototypeGround {
  GRASS,
  DIRT,
  STONE,
  WATER_SHALLOW,
  WATER_DEEP,
}

export enum PrototypeStructure {
  NONE,
  TREE,
  BRIDGE_HORIZONTAL,
  STAIRS,
  CAVE_MOUTH,
  WORKSHOP,
  WORKSHOP_FOOTPRINT,
  GARDEN,
  CRATE,
  FLOWERS,
}

export enum PrototypeGroundVisual {
  GRASS,
  GRASS_ALT,
  GRASS_FLOWERS,
  DIRT,
  DIRT_ALT,
  STONE,
  STONE_ALT,
  WATER_SHALLOW,
  WATER_SHALLOW_ALT,
  WATER_DEEP,
}

export enum PrototypeCliffVisual {
  NONE,
  STEP,
  TALL,
}

export interface TerrainPrototypeVisualCache {
  readonly ground: Uint8Array;
  readonly cliff: Uint8Array;
  readonly cliffEdgeMask: Uint8Array;
}

export interface TerrainPrototypeEditFeedback {
  readonly dirtyCellIndices: Set<number>;
  editedCellIndex: number | null;
  revision: number;
}

export interface TerrainPrototypePlane {
  readonly width: number;
  readonly height: number;
  readonly ground: Uint8Array;
  readonly structure: Uint8Array;
  readonly elevation: Int16Array;
  readonly collisionMap: TileType[];
  readonly visuals: TerrainPrototypeVisualCache;
  readonly editFeedback: TerrainPrototypeEditFeedback;
  readonly start: readonly [number, number];
}

export interface TerrainPrototypeEditResult {
  readonly editedCellIndex: number;
  readonly previousElevation: number;
  readonly nextElevation: number;
  readonly dirtyCellIndices: readonly number[];
}

function indexFor(x: number, y: number, width: number): number {
  return x + y * width;
}

function hashCell(x: number, y: number, salt: number): number {
  let value = Math.imul(x + salt, 374761393);
  value = Math.imul(value ^ (y + salt * 17), 668265263);
  return (value ^ (value >>> 13)) >>> 0;
}

/** Return a clipped square neighborhood in stable row-major order. */
export function terrainDirtyNeighborhood(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number = 1,
): number[] {
  const indices: number[] = [];
  for (
    let cellY = Math.max(0, y - radius);
    cellY <= Math.min(height - 1, y + radius);
    cellY++
  ) {
    for (
      let cellX = Math.max(0, x - radius);
      cellX <= Math.min(width - 1, x + radius);
      cellX++
    ) {
      indices.push(indexFor(cellX, cellY, width));
    }
  }
  return indices;
}

function resolveGroundVisual(
  ground: PrototypeGround,
  x: number,
  y: number,
): PrototypeGroundVisual {
  switch (ground) {
    case PrototypeGround.GRASS:
      if (hashCell(x, y, 81) % 17 === 0) {
        return PrototypeGroundVisual.GRASS_FLOWERS;
      }
      return hashCell(x, y, 82) % 2 === 0
        ? PrototypeGroundVisual.GRASS
        : PrototypeGroundVisual.GRASS_ALT;
    case PrototypeGround.DIRT:
      return hashCell(x, y, 83) % 2 === 0
        ? PrototypeGroundVisual.DIRT
        : PrototypeGroundVisual.DIRT_ALT;
    case PrototypeGround.STONE:
      return hashCell(x, y, 84) % 2 === 0
        ? PrototypeGroundVisual.STONE
        : PrototypeGroundVisual.STONE_ALT;
    case PrototypeGround.WATER_SHALLOW:
      return hashCell(x, y, 85) % 2 === 0
        ? PrototypeGroundVisual.WATER_SHALLOW
        : PrototypeGroundVisual.WATER_SHALLOW_ALT;
    case PrototypeGround.WATER_DEEP:
      return PrototypeGroundVisual.WATER_DEEP;
  }
}

function refreshVisualCell(plane: TerrainPrototypePlane, index: number): void {
  const x = index % plane.width;
  const y = Math.floor(index / plane.width);
  plane.visuals.ground[index] = resolveGroundVisual(
    plane.ground[index] as PrototypeGround,
    x,
    y,
  );
  const centerElevation = plane.elevation[index];
  const elevationAt = (sampleX: number, sampleY: number): number => {
    if (
      sampleX < 0 ||
      sampleY < 0 ||
      sampleX >= plane.width ||
      sampleY >= plane.height
    ) {
      return centerElevation;
    }
    return plane.elevation[indexFor(sampleX, sampleY, plane.width)];
  };
  const context = resolveElevationVisualContext(x, y, elevationAt);
  plane.visuals.cliff[index] =
    context.higherNeighborMask & ELEVATION_NORTH
      ? cliffMagnitudeForDrop(context.maximumRise) === "tall"
        ? PrototypeCliffVisual.TALL
        : PrototypeCliffVisual.STEP
      : PrototypeCliffVisual.NONE;
  plane.visuals.cliffEdgeMask[index] =
    context.higherNeighborMask & ELEVATION_NORTH
      ? 0
      : context.lowerNeighborMask &
        (ELEVATION_NORTH | ELEVATION_EAST | ELEVATION_SOUTH | ELEVATION_WEST);
}

function refreshCollisionCell(
  plane: TerrainPrototypePlane,
  index: number,
): void {
  const x = index % plane.width;
  const y = Math.floor(index / plane.width);
  if (x === 0 || y === 0 || x === plane.width - 1 || y === plane.height - 1) {
    plane.collisionMap[index] = TileType.WALL;
    return;
  }
  const ground = plane.ground[index] as PrototypeGround;
  const structure = plane.structure[index] as PrototypeStructure;
  const northElevation = plane.elevation[indexFor(x, y - 1, plane.width)];
  const blocks =
    ground === PrototypeGround.WATER_SHALLOW ||
    ground === PrototypeGround.WATER_DEEP ||
    structure === PrototypeStructure.TREE ||
    structure === PrototypeStructure.CAVE_MOUTH ||
    structure === PrototypeStructure.WORKSHOP ||
    structure === PrototypeStructure.WORKSHOP_FOOTPRINT ||
    northElevation > plane.elevation[index];
  plane.collisionMap[index] = blocks ? TileType.WALL : TileType.FLOOR;
  if (
    structure === PrototypeStructure.BRIDGE_HORIZONTAL ||
    structure === PrototypeStructure.STAIRS
  ) {
    plane.collisionMap[index] = TileType.FLOOR;
  }
}

/** Apply a semantic elevation edit and resolve only its 3x3 dependency area. */
export function applyTerrainPrototypeElevationEdit(
  plane: TerrainPrototypePlane,
  x: number,
  y: number,
  delta: number,
): TerrainPrototypeEditResult | null {
  if (x < 0 || y < 0 || x >= plane.width || y >= plane.height || delta === 0) {
    return null;
  }
  const editedCellIndex = indexFor(x, y, plane.width);
  const previousElevation = plane.elevation[editedCellIndex];
  const nextElevation = previousElevation + delta;
  plane.elevation[editedCellIndex] = nextElevation;
  const dirtyCellIndices = terrainDirtyNeighborhood(
    x,
    y,
    plane.width,
    plane.height,
  );
  plane.editFeedback.dirtyCellIndices.clear();
  for (const dirtyIndex of dirtyCellIndices) {
    refreshVisualCell(plane, dirtyIndex);
    refreshCollisionCell(plane, dirtyIndex);
    plane.editFeedback.dirtyCellIndices.add(dirtyIndex);
  }
  plane.editFeedback.editedCellIndex = editedCellIndex;
  plane.editFeedback.revision++;
  return {
    editedCellIndex,
    previousElevation,
    nextElevation,
    dirtyCellIndices,
  };
}

/** Build the fixed 40×30 visual acceptance scene. */
export function createTerrainPrototypePlane(): TerrainPrototypePlane {
  const cellCount = TERRAIN_PROTOTYPE_WIDTH * TERRAIN_PROTOTYPE_HEIGHT;
  const ground = new Uint8Array(cellCount).fill(PrototypeGround.GRASS);
  const structure = new Uint8Array(cellCount).fill(PrototypeStructure.NONE);
  const elevation = new Int16Array(cellCount);
  const collisionMap: TileType[] = new Array(cellCount).fill(TileType.FLOOR);

  const setGround = (x: number, y: number, value: PrototypeGround): void => {
    ground[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = value;
  };
  const setStructure = (
    x: number,
    y: number,
    value: PrototypeStructure,
  ): void => {
    structure[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = value;
  };
  const fillRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    callback: (cellX: number, cellY: number) => void,
  ): void => {
    for (let cellY = y; cellY < y + height; cellY++) {
      for (let cellX = x; cellX < x + width; cellX++) {
        callback(cellX, cellY);
      }
    }
  };

  // Bounded, quiet grass perimeter.
  for (let x = 0; x < TERRAIN_PROTOTYPE_WIDTH; x++) {
    collisionMap[indexFor(x, 0, TERRAIN_PROTOTYPE_WIDTH)] = TileType.WALL;
    collisionMap[
      indexFor(x, TERRAIN_PROTOTYPE_HEIGHT - 1, TERRAIN_PROTOTYPE_WIDTH)
    ] = TileType.WALL;
  }
  for (let y = 0; y < TERRAIN_PROTOTYPE_HEIGHT; y++) {
    collisionMap[indexFor(0, y, TERRAIN_PROTOTYPE_WIDTH)] = TileType.WALL;
    collisionMap[
      indexFor(TERRAIN_PROTOTYPE_WIDTH - 1, y, TERRAIN_PROTOTYPE_WIDTH)
    ] = TileType.WALL;
  }

  // Nested terraces: broad readable masses rather than per-cell height noise.
  fillRect(4, 3, 30, 22, (x, y) => {
    elevation[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = 2;
  });
  fillRect(9, 6, 21, 15, (x, y) => {
    elevation[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = 5;
  });
  fillRect(14, 9, 11, 8, (x, y) => {
    elevation[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = 8;
  });

  // An unusually tall but visually constant-cost escarpment.
  fillRect(27, 5, 7, 6, (x, y) => {
    elevation[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = 12;
    setGround(x, y, PrototypeGround.STONE);
  });

  // Signed canyon floor in the lower-left quarter.
  fillRect(3, 19, 9, 7, (x, y) => {
    elevation[indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH)] = -4;
    setGround(x, y, PrototypeGround.DIRT);
  });

  // Static river feeding a small lake. Water remains ordinary semantic data.
  fillRect(18, 0, 4, 8, (x, y) => {
    setGround(x, y, PrototypeGround.WATER_SHALLOW);
  });
  fillRect(17, 3, 6, 5, (x, y) => {
    setGround(x, y, PrototypeGround.WATER_SHALLOW);
  });
  fillRect(16, 2, 8, 4, (x, y) => {
    setGround(x, y, PrototypeGround.WATER_DEEP);
  });

  // Paths connect the homestead, bridge, stairs, and cave.
  fillRect(12, 12, 14, 2, (x, y) => setGround(x, y, PrototypeGround.DIRT));
  fillRect(19, 7, 2, 10, (x, y) => setGround(x, y, PrototypeGround.DIRT));
  fillRect(24, 8, 8, 2, (x, y) => setGround(x, y, PrototypeGround.STONE));

  // Bridge restores traversability across the river.
  for (let x = 17; x <= 22; x++) {
    setStructure(x, 6, PrototypeStructure.BRIDGE_HORIZONTAL);
  }

  // Stair openings make representative terrace boundaries traversable.
  setStructure(19, 17, PrototypeStructure.STAIRS);
  setStructure(19, 21, PrototypeStructure.STAIRS);
  setStructure(29, 11, PrototypeStructure.STAIRS);

  // Cheerful rebuilding vignette.
  setStructure(16, 11, PrototypeStructure.WORKSHOP);
  fillRect(15, 9, 3, 3, (x, y) => {
    if (x !== 16 || y !== 11) {
      setStructure(x, y, PrototypeStructure.WORKSHOP_FOOTPRINT);
    }
  });
  fillRect(21, 10, 3, 2, (x, y) =>
    setStructure(x, y, PrototypeStructure.GARDEN),
  );
  setStructure(18, 12, PrototypeStructure.CRATE);
  setStructure(25, 12, PrototypeStructure.FLOWERS);
  setStructure(12, 15, PrototypeStructure.FLOWERS);
  setStructure(27, 15, PrototypeStructure.FLOWERS);

  // Cave mouth and vegetation landmarks.
  setStructure(31, 8, PrototypeStructure.CAVE_MOUTH);
  const trees: readonly (readonly [number, number])[] = [
    [6, 6],
    [10, 4],
    [33, 14],
    [30, 20],
    [13, 24],
    [5, 15],
    [35, 23],
    [26, 3],
  ];
  for (const [x, y] of trees) setStructure(x, y, PrototypeStructure.TREE);

  // The legacy map supplies temporary physics. Water, tree trunks, structures,
  // and unbroken elevation faces block; bridges and explicit stairs override.
  for (let y = 1; y < TERRAIN_PROTOTYPE_HEIGHT - 1; y++) {
    for (let x = 1; x < TERRAIN_PROTOTYPE_WIDTH - 1; x++) {
      const idx = indexFor(x, y, TERRAIN_PROTOTYPE_WIDTH);
      const cellGround = ground[idx];
      const cellStructure = structure[idx];
      const northElevation =
        elevation[indexFor(x, y - 1, TERRAIN_PROTOTYPE_WIDTH)];
      const hasNorthCliff = northElevation > elevation[idx];
      const blocksForGround =
        cellGround === PrototypeGround.WATER_SHALLOW ||
        cellGround === PrototypeGround.WATER_DEEP;
      const blocksForStructure =
        cellStructure === PrototypeStructure.TREE ||
        cellStructure === PrototypeStructure.CAVE_MOUTH ||
        cellStructure === PrototypeStructure.WORKSHOP ||
        cellStructure === PrototypeStructure.WORKSHOP_FOOTPRINT;
      if (blocksForGround || blocksForStructure || hasNorthCliff) {
        collisionMap[idx] = TileType.WALL;
      }
      if (
        cellStructure === PrototypeStructure.BRIDGE_HORIZONTAL ||
        cellStructure === PrototypeStructure.STAIRS
      ) {
        collisionMap[idx] = TileType.FLOOR;
      }
    }
  }

  const plane: TerrainPrototypePlane = {
    width: TERRAIN_PROTOTYPE_WIDTH,
    height: TERRAIN_PROTOTYPE_HEIGHT,
    ground,
    structure,
    elevation,
    collisionMap,
    visuals: {
      ground: new Uint8Array(cellCount),
      cliff: new Uint8Array(cellCount),
      cliffEdgeMask: new Uint8Array(cellCount),
    },
    editFeedback: {
      dirtyCellIndices: new Set(),
      editedCellIndex: null,
      revision: 0,
    },
    start: [19, 14],
  };
  for (let index = 0; index < cellCount; index++) {
    refreshVisualCell(plane, index);
  }
  return plane;
}
