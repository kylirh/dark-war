import {
  DungeonData,
  ItemType,
  OUTSIDE_MAP_HEIGHT,
  OUTSIDE_MAP_WIDTH,
  TileType,
  WallSet,
} from "../types";
import { ItemEntity } from "../entities/item-entity";
import { setTileFor } from "../utils/helpers";

export interface OutsideLevelData extends DungeonData {
  entities: ItemEntity[];
  wallDamage: number[];
}

const WIDTH = OUTSIDE_MAP_WIDTH;
const HEIGHT = OUTSIDE_MAP_HEIGHT;

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

  // Overgrown park in the southwest quadrant.
  fillRect(map, 4, 34, 36, 27, TileType.GRASS);
  fillRect(map, 6, 36, 32, 23, TileType.WEEDS);
  addParkPath(map, 7, 48, 36, 3);
  addParkPath(map, 23, 36, 3, 22);
  addTreeCluster(map, [
    [8, 37],
    [13, 39],
    [18, 37],
    [31, 38],
    [35, 43],
    [10, 55],
    [17, 57],
    [29, 55],
    [34, 57],
    [6, 42],
    [12, 45],
    [28, 42],
    [36, 50],
  ]);

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
  addBuilding(map, 43, 40, 18, 12);
  addBuilding(map, 43, 57, 22, 10);
  addBuilding(map, 82, 57, 16, 10);
  addBuilding(map, 113, 56, 11, 11);

  // Abandoned field clinic/research van.
  fillRect(map, 50, 44, 9, 4, TileType.SIDEWALK);
  fillRect(map, 52, 45, 5, 2, TileType.FLOOR);
  setTileFor(map, 51, 45, WIDTH, TileType.RUBBLE);
  setTileFor(map, 57, 46, WIDTH, TileType.RUBBLE);

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

  setTileFor(map, stairsDown[0], stairsDown[1], WIDTH, TileType.STAIRS_DOWN);

  const entities = [new ItemEntity(16, 58, ItemType.CTDM)];

  return {
    map,
    width: WIDTH,
    height: HEIGHT,
    floorVariant: 0,
    wallSet,
    start,
    stairsDown,
    rooms: [],
    entities,
    wallDamage: new Array(WIDTH * HEIGHT).fill(0),
  };
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
