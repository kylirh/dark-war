import {
  DungeonData,
  ItemType,
  MonsterType,
  OUTSIDE_MAP_HEIGHT,
  OUTSIDE_MAP_WIDTH,
  TileType,
  WallSet,
} from "../types";
import { ItemEntity } from "../entities/item-entity";
import { MonsterEntity } from "../entities/monster-entity";
import { setTileFor } from "../utils/helpers";
import {
  createWorldPlaneFromTiles,
  FixtureType,
  GroundType,
  StructureType,
} from "./world-semantics";
import { WorldPlane } from "./world-plane";
import { semanticPrefab, stampSemanticPrefab } from "./semantic-prefab";
import { createWorkshopBuilder, createParkBuilder } from "./actor-factory";

export interface OutsideLevelData extends Omit<DungeonData, "map"> {
  entities: Array<ItemEntity | MonsterEntity>;
  worldPlane: WorldPlane;
  workshopDoor: [number, number];
}

const WIDTH = OUTSIDE_MAP_WIDTH;
const HEIGHT = OUTSIDE_MAP_HEIGHT;
export const OUTSIDE_CAVE_MOUTH: readonly [number, number] = [62, 40];
export const PARK_WORKSHOP_ORIGIN: readonly [number, number] = [57, 56];
/** Where the workshop builder greets the player, just east of the start. */
export const BUILDER_START: readonly [number, number] = [15, 58];

/** Resolve the workshop entrance from its Tiled-authored portal marker. */
export function parkWorkshopDoor(): [number, number] {
  const marker = semanticPrefab("settlement.workshop-garden").markers.find(
    (candidate) =>
      candidate.kind === "portal" && candidate.name === "workshop-entrance",
  );
  if (!marker) {
    throw new Error("Workshop prefab is missing its entrance portal marker");
  }
  return [
    PARK_WORKSHOP_ORIGIN[0] + marker.x,
    PARK_WORKSHOP_ORIGIN[1] + marker.y,
  ];
}

/**
 * Build the hand-authored level 0 city outside the Megacorp facility.
 */
export function createOutsideLevel(): OutsideLevelData {
  const map: TileType[] = new Array(WIDTH * HEIGHT).fill(TileType.GRASS);
  const wallSet: WallSet = "concrete";
  const start: [number, number] = [12, 58];
  const stairsDown: [number, number] = [16, 44];

  fillRect(map, 0, 0, WIDTH, HEIGHT, TileType.WEEDS);

  // Streets form an old city grid with sidewalks on both sides.
  addStreet(map, 0, 53, WIDTH, 7);
  addStreet(map, 0, 30, WIDTH, 6);
  addStreet(map, 20, 0, 7, HEIGHT);
  addStreet(map, 70, 0, 7, HEIGHT);
  addStreet(map, 104, 0, 7, HEIGHT);

  // Wild growth has pushed through the old commercial blocks.
  fillRect(map, 28, 31, 11, 4, TileType.WEEDS);
  fillRect(map, 60, 31, 8, 3, TileType.GRASS);
  fillRect(map, 77, 54, 12, 3, TileType.WEEDS);
  fillRect(map, 100, 57, 9, 5, TileType.GRASS);
  addTreeCluster(map, [
    [61, 32],
    [88, 50],
    [101, 58],
    [107, 60],
  ]);

  // Non-enterable city buildings.
  addBuilding(map, 3, 5, 14, 16);
  addBuilding(map, 30, 4, 27, 14);
  addBuilding(map, 81, 5, 16, 19);
  addBuilding(map, 3, 22, 14, 8);
  addBuilding(map, 31, 22, 28, 7);
  addBuilding(map, 82, 33, 16, 16);
  addBuilding(map, 113, 32, 11, 16);
  addBuilding(map, 82, 57, 16, 10);
  addBuilding(map, 113, 56, 11, 11);

  addCityPark(map);

  // Megacorp research facility perimeter and entrance.
  addFacility(map, stairsDown);

  // Barricades and abandoned debris.
  fillRect(map, 66, 51, 3, 1, TileType.RUBBLE);
  fillRect(map, 71, 49, 2, 2, TileType.RUBBLE);
  fillRect(map, 78, 31, 1, 5, TileType.FENCE);
  fillRect(map, 99, 52, 4, 1, TileType.RUBBLE);
  fillRect(map, 91, 30, 2, 2, TileType.RUBBLE);
  fillRect(map, 17, 28, 3, 1, TileType.FENCE);
  fillRect(map, 108, 26, 7, 1, TileType.FENCE);
  fillRect(map, 111, 27, 1, 4, TileType.FENCE);

  // Keep edge tiles walkable but visually compatible with eventual wrapping.
  addStreet(map, 0, 0, WIDTH, 3);
  addStreet(map, 0, HEIGHT - 3, WIDTH, 3);
  addStreet(map, 0, 0, 3, HEIGHT);
  addStreet(map, WIDTH - 3, 0, 3, HEIGHT);

  // Streetlights line the avenues. These are real LIGHT tiles (not decoration)
  // so the player can mine them into Light Fixtures with the Matter Manipulator
  // — the surface is the only place light fixtures can be sourced.
  addStreetLights(map);

  setTileFor(map, stairsDown[0], stairsDown[1], WIDTH, TileType.STAIRS_DOWN);

  // The workshop builder gives the player the CTDM and Matter Manipulator in
  // conversation. The pickaxe remains available near the starting workshop.
  const entities: Array<ItemEntity | MonsterEntity> = [
    new ItemEntity(14, 58, ItemType.PICKAXE),
  ];

  const worldPlane = createWorldPlaneFromTiles(map, WIDTH, HEIGHT, undefined, {
    wraps: true,
  });
  addNaturalTerrain(worldPlane);
  worldPlane.editCell(OUTSIDE_CAVE_MOUTH[0], OUTSIDE_CAVE_MOUTH[1], {
    ground: GroundType.GRASS,
    structure: StructureType.NONE,
    fixture: FixtureType.CAVE_MOUTH,
    elevation: 3,
  });
  const workshopStamp = stampSemanticPrefab(
    worldPlane,
    semanticPrefab("settlement.workshop-garden"),
    PARK_WORKSHOP_ORIGIN[0],
    PARK_WORKSHOP_ORIGIN[1],
  );
  // The workshop builder meets the player right on the path out of the start
  // (where the CTDM/Manipulator used to lie) and hands over that starting gear
  // in conversation. Placed here rather than at the park workshop so the player
  // is equipped immediately, before trekking anywhere.
  entities.push(createWorkshopBuilder(BUILDER_START[0], BUILDER_START[1]));
  // A second settler tends the park workshop, spawned from the prefab's
  // authored `npc.builder` marker (stable, idempotent identity).
  const builderMarker = workshopStamp.markers.find(
    (marker) =>
      marker.kind === "spawn" &&
      marker.properties["darkwar.spawn"] === "npc.builder",
  );
  if (builderMarker) {
    const stableId = `npc:outside/surface:workshop-garden:${builderMarker.name}`;
    entities.push(
      createParkBuilder(builderMarker.worldX, builderMarker.worldY, stableId),
    );
  }
  const workshopDoor = parkWorkshopDoor();
  return {
    width: WIDTH,
    height: HEIGHT,
    floorVariant: 0,
    wallSet,
    start,
    stairsDown,
    rooms: [],
    entities,
    worldPlane,
    workshopDoor,
  };
}

/** Add the first production terraces, static pond, and walkable bridge. */
function addNaturalTerrain(plane: WorldPlane): void {
  const hillCenterX = 62;
  const hillCenterY = 41;
  for (let y = 34; y <= 48; y++) {
    for (let x = 53; x <= 71; x++) {
      const dx = (x - hillCenterX) / 9;
      const dy = (y - hillCenterY) / 7;
      const distance = dx * dx + dy * dy;
      const elevation =
        distance <= 0.12 ? 3 : distance <= 0.42 ? 2 : distance <= 1 ? 1 : 0;
      if (elevation === 0) continue;
      plane.editCell(x, y, { elevation });
    }
  }
  for (const [x, y, elevation] of [
    [53, hillCenterY, 1],
    [57, hillCenterY, 2],
    [59, hillCenterY, 3],
    [71, hillCenterY, 1],
    [67, hillCenterY, 2],
    [65, hillCenterY, 3],
  ] as const) {
    plane.editCell(x, y, { elevation, fixture: FixtureType.STAIRS });
  }

  const pondCenterX = 43;
  const pondCenterY = 47;
  for (let y = 39; y <= 55; y++) {
    for (let x = 31; x <= 55; x++) {
      const dx = (x - pondCenterX) / 12;
      const dy = (y - pondCenterY) / 8;
      const distance = dx * dx + dy * dy;
      if (distance > 1) continue;
      const index = plane.indexFor(x, y);
      if (plane.layers.structure[index] !== StructureType.NONE) continue;
      plane.editCell(x, y, {
        ground:
          distance < 0.46 ? GroundType.WATER_DEEP : GroundType.WATER_SHALLOW,
        elevation: -1,
        fixture: FixtureType.NONE,
      });
    }
  }
  for (let x = 31; x <= 55; x++) {
    const index = plane.indexFor(x, pondCenterY);
    if (
      plane.layers.ground[index] !== GroundType.WATER_SHALLOW &&
      plane.layers.ground[index] !== GroundType.WATER_DEEP
    ) {
      continue;
    }
    plane.editCell(x, pondCenterY, {
      structure: StructureType.BRIDGE_HORIZONTAL,
      elevation: 0,
    });
  }
  for (let x = 54; x <= 68; x++) {
    plane.editCell(x, pondCenterY + 2, {
      ground: GroundType.WATER_RIVER,
      structure: StructureType.NONE,
      fixture: FixtureType.NONE,
      elevation: -1,
    });
  }
}

/** Lay out a substantial civic park around the pond, grotto, and workshop. */
function addCityPark(map: TileType[]): void {
  fillRect(map, 29, 35, 42, 34, TileType.GRASS);
  fillRect(map, 31, 37, 38, 30, TileType.WEEDS);

  // A broad promenade, pond loop, and workshop spur make the park readable.
  addParkPath(map, 29, 57, 42, 3);
  addParkPath(map, 47, 35, 3, 34);
  addParkPath(map, 32, 37, 3, 21);
  addParkPath(map, 54, 53, 15, 3);
  addParkPath(map, 36, 64, 25, 2);

  addTreeCluster(map, [
    [30, 36],
    [36, 36],
    [43, 36],
    [50, 37],
    [67, 36],
    [30, 60],
    [34, 66],
    [43, 66],
    [51, 64],
    [66, 62],
    [68, 53],
  ]);

  for (const [x, y] of [
    [38, 61],
    [41, 61],
    [52, 61],
    [55, 63],
    [33, 55],
  ] as const) {
    setTileFor(map, x, y, WIDTH, TileType.RUBBLE);
  }
}

function fillRect(
  map: TileType[],
  x: number,
  y: number,
  w: number,
  h: number,
  tile: TileType,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= WIDTH || yy >= HEIGHT) continue;
      setTileFor(map, xx, yy, WIDTH, tile);
    }
  }
}

function addStreet(
  map: TileType[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  fillRect(map, x, y, w, h, TileType.ASPHALT);
  fillRect(map, x, y - 1, w, 1, TileType.SIDEWALK);
  fillRect(map, x, y + h, w, 1, TileType.SIDEWALK);
}

/**
 * Scatter lampposts across every sidewalk on the surface — the avenues and the
 * facility plaza alike. Lights only replace surviving sidewalk tiles (so the
 * park, buildings, and streets never sprout a floating lamp), on a regular grid
 * so they read as intentional streetlights the player can mine for fixtures.
 */
function addStreetLights(map: TileType[]): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (x % 5 !== 0 || y % 4 !== 0) continue;
      const idx = x + y * WIDTH;
      if (map[idx] === TileType.SIDEWALK) map[idx] = TileType.LIGHT;
    }
  }
}

function addParkPath(
  map: TileType[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  fillRect(map, x, y, w, h, TileType.PARK_PATH);
}

function addTreeCluster(map: TileType[], positions: [number, number][]): void {
  for (const [x, y] of positions) {
    fillRect(map, x, y, 2, 2, TileType.TREE);
  }
}

function addBuilding(
  map: TileType[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  fillRect(map, x, y, w, h, TileType.BUILDING);
  fillRect(map, x + 1, y + h - 1, Math.max(1, w - 2), 1, TileType.FENCE);
}

function addFacility(map: TileType[], entrance: [number, number]): void {
  const x = entrance[0] - 12;
  const y = entrance[1] - 9;

  fillRect(map, x, y, 24, 22, TileType.BUILDING);
  fillRect(map, x, y + 21, 24, 3, TileType.SIDEWALK);

  // Public access hall cut into the otherwise sealed facility facade.
  fillRect(map, entrance[0] - 2, entrance[1], 5, 13, TileType.FLOOR);
  fillRect(map, entrance[0] - 5, y + 17, 11, 3, TileType.FLOOR);
  fillRect(map, entrance[0] - 7, y + 20, 17, 1, TileType.SIDEWALK);

  // Multiple sealed exterior doors can be opened and all lead to region 1.
  setTileFor(map, entrance[0] - 3, y + 20, WIDTH, TileType.DOOR_CLOSED);
  setTileFor(map, entrance[0], y + 20, WIDTH, TileType.DOOR_CLOSED);
  setTileFor(map, entrance[0] + 3, y + 20, WIDTH, TileType.DOOR_CLOSED);

  fillRect(map, entrance[0] - 1, entrance[1] - 1, 3, 3, TileType.FLOOR);
}
