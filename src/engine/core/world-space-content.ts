/** Small deterministic world planes reached through semantic portals. */

import { TileType, WallSet } from "../types";
import { setTileFor } from "../utils/helpers";
import { WorldPlane } from "./world-plane";
import {
  createWorldPlaneFromTiles,
  FixtureType,
  GroundType,
  StructureType,
} from "./world-semantics";
import { WorldAddress, WorldPortal } from "./world-space";
import { OUTSIDE_CAVE_MOUTH, parkWorkshopDoor } from "./outside-level";
import { semanticPrefab, stampSemanticPrefab } from "./semantic-prefab";

export const CAVE_ENTRY_ADDRESS: WorldAddress = {
  spaceId: "caves",
  planeId: "park-grotto",
};

export const WORKSHOP_INTERIOR_ADDRESS: WorldAddress = {
  spaceId: "settlement",
  planeId: "park-workshop",
};

export interface AuthoredWorldPlaneData {
  readonly address: WorldAddress;
  readonly depth: number;
  readonly width: number;
  readonly height: number;
  readonly floorVariant: number;
  readonly wallSet: WallSet;
  readonly start: [number, number];
  readonly stairsDown: [number, number];
  readonly stairsUp: [number, number] | null;
  readonly worldPlane: WorldPlane;
  readonly portals: WorldPortal[];
}

/** Build the first cave as an independent, bounded 2D plane. */
export function createParkGrotto(): AuthoredWorldPlaneData {
  const width = 48;
  const height = 32;
  const start: [number, number] = [4, 16];
  const map = new Array<TileType>(width * height).fill(TileType.WALL);

  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      const chamberA = ((x - 14) / 12) ** 2 + ((y - 16) / 10) ** 2 <= 1;
      const chamberB = ((x - 34) / 10) ** 2 + ((y - 11) / 7) ** 2 <= 1;
      const chamberC = ((x - 33) / 11) ** 2 + ((y - 23) / 6) ** 2 <= 1;
      const corridor = x >= 14 && x <= 35 && y >= 13 && y <= 18;
      if (chamberA || chamberB || chamberC || corridor) {
        setTileFor(map, x, y, width, TileType.FLOOR);
      }
    }
  }
  setTileFor(map, start[0], start[1], width, TileType.STAIRS_UP);
  for (const [x, y] of [
    [11, 8],
    [18, 23],
    [29, 7],
    [39, 22],
  ] as const) {
    setTileFor(map, x, y, width, TileType.RUBBLE);
  }

  const worldPlane = createWorldPlaneFromTiles(map, width, height, undefined, {
    variantSeed: 0xca7e,
  });
  stampSemanticPrefab(worldPlane, semanticPrefab("cave.rest-stop"), 24, 10);
  const outsideAddress: WorldAddress = {
    spaceId: "outside",
    planeId: "surface",
  };
  return {
    address: CAVE_ENTRY_ADDRESS,
    depth: 0,
    width,
    height,
    floorVariant: 1,
    wallSet: "concrete",
    start,
    stairsDown: start,
    stairsUp: start,
    worldPlane,
    portals: [
      {
        id: "caves/park-grotto:exit",
        kind: "cave-mouth",
        source: { ...CAVE_ENTRY_ADDRESS, x: start[0], y: start[1] },
        destination: {
          ...outsideAddress,
          entry: "start",
          x: OUTSIDE_CAVE_MOUTH[0],
          y: OUTSIDE_CAVE_MOUTH[1] + 1,
        },
      },
    ],
  };
}

/** Build the park workshop as a cozy independent interior plane. */
export function createWorkshopInterior(): AuthoredWorldPlaneData {
  const width = 24;
  const height = 18;
  const start: [number, number] = [12, 16];
  const map = new Array<TileType>(width * height).fill(TileType.WALL);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      setTileFor(map, x, y, width, TileType.FLOOR);
    }
  }
  setTileFor(map, start[0], start[1], width, TileType.STAIRS_UP);

  // Work benches and storage divide the room without sealing it into corridors.
  for (const [x, y] of [
    [3, 3],
    [4, 3],
    [5, 3],
    [18, 3],
    [19, 3],
    [20, 3],
    [3, 10],
    [20, 10],
  ] as const) {
    setTileFor(map, x, y, width, TileType.RUBBLE);
  }

  const worldPlane = createWorldPlaneFromTiles(map, width, height, undefined, {
    variantSeed: 0x7a11,
  });
  for (let y = 6; y <= 8; y++) {
    for (let x = 4; x <= 8; x++) {
      worldPlane.editCell(x, y, {
        ground: GroundType.DIRT,
        structure: StructureType.NONE,
        fixture: (x + y) % 3 === 0 ? FixtureType.FLOWERS : FixtureType.GARDEN,
      });
    }
  }
  for (const [x, y] of [
    [16, 6],
    [18, 6],
    [16, 8],
    [18, 8],
  ] as const) {
    worldPlane.editCell(x, y, { fixture: FixtureType.CRATE });
  }

  const outsideAddress: WorldAddress = {
    spaceId: "outside",
    planeId: "surface",
  };
  const workshopDoor = parkWorkshopDoor();
  return {
    address: WORKSHOP_INTERIOR_ADDRESS,
    depth: 0,
    width,
    height,
    floorVariant: 2,
    wallSet: "wood",
    start,
    stairsDown: start,
    stairsUp: start,
    worldPlane,
    portals: [
      {
        id: "settlement/park-workshop:exit",
        kind: "door",
        source: { ...WORKSHOP_INTERIOR_ADDRESS, x: start[0], y: start[1] },
        destination: {
          ...outsideAddress,
          entry: "start",
          x: workshopDoor[0],
          y: workshopDoor[1] + 1,
        },
      },
    ],
  };
}
