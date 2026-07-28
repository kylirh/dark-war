/**
 * Deterministic Milestone 1 terrain slice.
 *
 * This development fixture proves compositional layers, signed elevation,
 * static water, authored structures, and legacy collision interop before the
 * scalar map is replaced globally. It is never serialized as production data.
 */

import { TileType } from "../../types";

export const TERRAIN_PROTOTYPE_WIDTH = 40;
export const TERRAIN_PROTOTYPE_HEIGHT = 30;

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

export interface TerrainPrototypePlane {
  readonly width: number;
  readonly height: number;
  readonly ground: Uint8Array;
  readonly structure: Uint8Array;
  readonly elevation: Int16Array;
  readonly collisionMap: TileType[];
  readonly start: readonly [number, number];
}

function indexFor(x: number, y: number): number {
  return x + y * TERRAIN_PROTOTYPE_WIDTH;
}

/** Build the fixed 40×30 visual acceptance scene. */
export function createTerrainPrototypePlane(): TerrainPrototypePlane {
  const cellCount = TERRAIN_PROTOTYPE_WIDTH * TERRAIN_PROTOTYPE_HEIGHT;
  const ground = new Uint8Array(cellCount).fill(PrototypeGround.GRASS);
  const structure = new Uint8Array(cellCount).fill(PrototypeStructure.NONE);
  const elevation = new Int16Array(cellCount);
  const collisionMap: TileType[] = new Array(cellCount).fill(TileType.FLOOR);

  const setGround = (x: number, y: number, value: PrototypeGround): void => {
    ground[indexFor(x, y)] = value;
  };
  const setStructure = (
    x: number,
    y: number,
    value: PrototypeStructure,
  ): void => {
    structure[indexFor(x, y)] = value;
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
    collisionMap[indexFor(x, 0)] = TileType.WALL;
    collisionMap[indexFor(x, TERRAIN_PROTOTYPE_HEIGHT - 1)] = TileType.WALL;
  }
  for (let y = 0; y < TERRAIN_PROTOTYPE_HEIGHT; y++) {
    collisionMap[indexFor(0, y)] = TileType.WALL;
    collisionMap[indexFor(TERRAIN_PROTOTYPE_WIDTH - 1, y)] = TileType.WALL;
  }

  // Nested terraces: broad readable masses rather than per-cell height noise.
  fillRect(4, 3, 30, 22, (x, y) => {
    elevation[indexFor(x, y)] = 2;
  });
  fillRect(9, 6, 21, 15, (x, y) => {
    elevation[indexFor(x, y)] = 5;
  });
  fillRect(14, 9, 11, 8, (x, y) => {
    elevation[indexFor(x, y)] = 8;
  });

  // An unusually tall but visually constant-cost escarpment.
  fillRect(27, 5, 7, 6, (x, y) => {
    elevation[indexFor(x, y)] = 12;
    setGround(x, y, PrototypeGround.STONE);
  });

  // Signed canyon floor in the lower-left quarter.
  fillRect(3, 19, 9, 7, (x, y) => {
    elevation[indexFor(x, y)] = -4;
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
      const idx = indexFor(x, y);
      const cellGround = ground[idx];
      const cellStructure = structure[idx];
      const northElevation = elevation[indexFor(x, y - 1)];
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

  return {
    width: TERRAIN_PROTOTYPE_WIDTH,
    height: TERRAIN_PROTOTYPE_HEIGHT,
    ground,
    structure,
    elevation,
    collisionMap,
    start: [19, 14],
  };
}
