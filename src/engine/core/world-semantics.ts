/**
 * Compact production semantic IDs and current TileType classification.
 * Stable dotted authoring keys will compile to these runtime values.
 */

import { SerializedWorldPlane, TILE_DEFINITIONS, TileType } from "../types";
import {
  createWorldPlaneLayers,
  WorldCellSemantics,
  WorldPlane,
} from "./world-plane";

export enum GroundType {
  VOID,
  FLOOR,
  GRASS,
  WEEDS,
  PARK_PATH,
  ASPHALT,
  SIDEWALK,
  DIRT,
  STONE,
  WATER_SHALLOW,
  WATER_DEEP,
  HOLE,
}

export enum StructureType {
  NONE,
  WALL,
  HOLOWALL,
  DOOR_CLOSED,
  DOOR_OPEN,
  DOOR_LOCKED,
  TREE,
  BUILDING,
  FENCE,
  RUBBLE,
  BRIDGE_HORIZONTAL,
  WORKSHOP,
  WORKSHOP_FOOTPRINT,
}

export enum FixtureType {
  NONE,
  STAIRS_DOWN,
  STAIRS_UP,
  LIGHT,
  STAIRS,
  CAVE_MOUTH,
  GARDEN,
  CRATE,
  FLOWERS,
}

export interface SemanticCellIds {
  readonly ground: GroundType;
  readonly structure: StructureType;
  readonly fixture: FixtureType;
}

export const GROUND_KEYS: Readonly<Record<GroundType, string>> = {
  [GroundType.VOID]: "ground.void",
  [GroundType.FLOOR]: "ground.floor",
  [GroundType.GRASS]: "ground.grass",
  [GroundType.WEEDS]: "ground.weeds",
  [GroundType.PARK_PATH]: "ground.park-path",
  [GroundType.ASPHALT]: "ground.asphalt",
  [GroundType.SIDEWALK]: "ground.sidewalk",
  [GroundType.DIRT]: "ground.dirt",
  [GroundType.STONE]: "ground.stone",
  [GroundType.WATER_SHALLOW]: "ground.water.shallow",
  [GroundType.WATER_DEEP]: "ground.water.deep",
  [GroundType.HOLE]: "ground.hole",
};

export const STRUCTURE_KEYS: Readonly<Record<StructureType, string>> = {
  [StructureType.NONE]: "structure.none",
  [StructureType.WALL]: "structure.wall",
  [StructureType.HOLOWALL]: "structure.holowall",
  [StructureType.DOOR_CLOSED]: "structure.door.closed",
  [StructureType.DOOR_OPEN]: "structure.door.open",
  [StructureType.DOOR_LOCKED]: "structure.door.locked",
  [StructureType.TREE]: "structure.tree",
  [StructureType.BUILDING]: "structure.building",
  [StructureType.FENCE]: "structure.fence",
  [StructureType.RUBBLE]: "structure.rubble",
  [StructureType.BRIDGE_HORIZONTAL]: "structure.bridge.wood.horizontal",
  [StructureType.WORKSHOP]: "structure.workshop",
  [StructureType.WORKSHOP_FOOTPRINT]: "structure.workshop.footprint",
};

export const FIXTURE_KEYS: Readonly<Record<FixtureType, string>> = {
  [FixtureType.NONE]: "fixture.none",
  [FixtureType.STAIRS_DOWN]: "fixture.stairs.down",
  [FixtureType.STAIRS_UP]: "fixture.stairs.up",
  [FixtureType.LIGHT]: "fixture.light",
  [FixtureType.STAIRS]: "fixture.stairs",
  [FixtureType.CAVE_MOUTH]: "fixture.cave-mouth",
  [FixtureType.GARDEN]: "fixture.garden-bed",
  [FixtureType.CRATE]: "fixture.crate",
  [FixtureType.FLOWERS]: "fixture.flowers",
};

const FLOOR_CELL: SemanticCellIds = {
  ground: GroundType.FLOOR,
  structure: StructureType.NONE,
  fixture: FixtureType.NONE,
};

/** Classify every scalar tile into compositional production layers. */
export function semanticCellForTile(tile: TileType): SemanticCellIds {
  switch (tile) {
    case TileType.WALL:
      return { ...FLOOR_CELL, structure: StructureType.WALL };
    case TileType.FLOOR:
      return FLOOR_CELL;
    case TileType.DOOR_CLOSED:
      return { ...FLOOR_CELL, structure: StructureType.DOOR_CLOSED };
    case TileType.DOOR_OPEN:
      return { ...FLOOR_CELL, structure: StructureType.DOOR_OPEN };
    case TileType.DOOR_LOCKED:
      return { ...FLOOR_CELL, structure: StructureType.DOOR_LOCKED };
    case TileType.STAIRS_DOWN:
      return { ...FLOOR_CELL, fixture: FixtureType.STAIRS_DOWN };
    case TileType.STAIRS_UP:
      return { ...FLOOR_CELL, fixture: FixtureType.STAIRS_UP };
    case TileType.HOLE:
      return { ...FLOOR_CELL, ground: GroundType.HOLE };
    case TileType.ASPHALT:
      return { ...FLOOR_CELL, ground: GroundType.ASPHALT };
    case TileType.SIDEWALK:
      return { ...FLOOR_CELL, ground: GroundType.SIDEWALK };
    case TileType.GRASS:
      return { ...FLOOR_CELL, ground: GroundType.GRASS };
    case TileType.WEEDS:
      return { ...FLOOR_CELL, ground: GroundType.WEEDS };
    case TileType.PARK_PATH:
      return { ...FLOOR_CELL, ground: GroundType.PARK_PATH };
    case TileType.TREE:
      return {
        ground: GroundType.GRASS,
        structure: StructureType.TREE,
        fixture: FixtureType.NONE,
      };
    case TileType.BUILDING:
      return { ...FLOOR_CELL, structure: StructureType.BUILDING };
    case TileType.FENCE:
      return {
        ground: GroundType.GRASS,
        structure: StructureType.FENCE,
        fixture: FixtureType.NONE,
      };
    case TileType.RUBBLE:
      return { ...FLOOR_CELL, structure: StructureType.RUBBLE };
    case TileType.HOLOWALL:
      return { ...FLOOR_CELL, structure: StructureType.HOLOWALL };
    case TileType.LIGHT:
      return {
        ground: GroundType.SIDEWALK,
        structure: StructureType.NONE,
        fixture: FixtureType.LIGHT,
      };
  }
}

/**
 * Convert a generated scalar layout into an authoritative layered plane.
 * This is a generator migration boundary, not a persistent compatibility path.
 */
export function createWorldPlaneFromTiles(
  tiles: readonly TileType[],
  width: number,
  height: number,
  damage?: readonly number[],
): WorldPlane {
  const cellCount = width * height;
  if (tiles.length !== cellCount) {
    throw new Error("Generated tile layout must match width × height");
  }
  const layers = createWorldPlaneLayers(width, height);
  const writeSemanticCell = (index: number, tile: TileType): void => {
    const cell = semanticCellForTile(tile);
    layers.ground[index] = cell.ground;
    layers.structure[index] = cell.structure;
    layers.fixture[index] = cell.fixture;
  };
  for (let index = 0; index < cellCount; index++) {
    writeSemanticCell(index, tiles[index]);
    layers.damage[index] = Math.max(0, Math.min(255, damage?.[index] ?? 0));
  }
  return new WorldPlane(
    width,
    height,
    layers,
    (planeLayers, index) =>
      resolveSemanticCell({
        ground: planeLayers.ground[index] as GroundType,
        structure: planeLayers.structure[index] as StructureType,
        fixture: planeLayers.fixture[index] as FixtureType,
      }),
    (_planeLayers, index, tile) => writeSemanticCell(index, tile),
  );
}

/** Copy one authoritative plane into its JSON/wire representation. */
export function serializeWorldPlane(plane: WorldPlane): SerializedWorldPlane {
  return {
    width: plane.width,
    height: plane.height,
    ground: Array.from(plane.layers.ground),
    structure: Array.from(plane.layers.structure),
    fixture: Array.from(plane.layers.fixture),
    elevation: Array.from(plane.layers.elevation),
    damage: Array.from(plane.layers.damage),
  };
}

/** Hydrate the current layered format. No scalar/legacy format is accepted. */
export function deserializeWorldPlane(data: SerializedWorldPlane): WorldPlane {
  if (
    !Number.isInteger(data.width) ||
    data.width <= 0 ||
    !Number.isInteger(data.height) ||
    data.height <= 0
  ) {
    throw new Error("Invalid save: malformed world plane dimensions");
  }
  const cellCount = data.width * data.height;
  for (const layer of [
    data.ground,
    data.structure,
    data.fixture,
    data.elevation,
    data.damage,
  ]) {
    if (!Array.isArray(layer) || layer.length !== cellCount) {
      throw new Error("Invalid save: malformed world plane layers");
    }
  }
  const layers = {
    ground: Uint16Array.from(data.ground),
    structure: Uint16Array.from(data.structure),
    fixture: Uint16Array.from(data.fixture),
    elevation: Int16Array.from(data.elevation),
    damage: Uint8Array.from(data.damage),
  };
  return new WorldPlane(
    data.width,
    data.height,
    layers,
    (planeLayers, index) =>
      resolveSemanticCell({
        ground: planeLayers.ground[index] as GroundType,
        structure: planeLayers.structure[index] as StructureType,
        fixture: planeLayers.fixture[index] as FixtureType,
      }),
    (planeLayers, index, tile) => {
      const cell = semanticCellForTile(tile);
      planeLayers.ground[index] = cell.ground;
      planeLayers.structure[index] = cell.structure;
      planeLayers.fixture[index] = cell.fixture;
    },
  );
}

/** Resolve current gameplay properties from one compositional semantic cell. */
export function resolveSemanticCell(cell: SemanticCellIds): WorldCellSemantics {
  let tile = tileForGround(cell.ground);
  if (cell.structure !== StructureType.NONE) {
    tile = tileForStructure(cell.structure);
  }
  if (cell.fixture !== FixtureType.NONE) {
    tile = tileForFixture(cell.fixture);
  }
  if (cell.structure === StructureType.BRIDGE_HORIZONTAL) {
    tile = TileType.FLOOR;
  }
  const definition = TILE_DEFINITIONS[tile];
  return {
    tile,
    passable: !definition.block,
    opaque: definition.opaque,
    destructible:
      cell.structure === StructureType.WALL ||
      cell.structure === StructureType.TREE ||
      cell.structure === StructureType.BUILDING ||
      cell.structure === StructureType.FENCE ||
      cell.structure === StructureType.RUBBLE,
  };
}

function tileForGround(ground: GroundType): TileType {
  switch (ground) {
    case GroundType.VOID:
    case GroundType.WATER_SHALLOW:
    case GroundType.WATER_DEEP:
      return TileType.WALL;
    case GroundType.FLOOR:
    case GroundType.DIRT:
    case GroundType.STONE:
      return TileType.FLOOR;
    case GroundType.GRASS:
      return TileType.GRASS;
    case GroundType.WEEDS:
      return TileType.WEEDS;
    case GroundType.PARK_PATH:
      return TileType.PARK_PATH;
    case GroundType.ASPHALT:
      return TileType.ASPHALT;
    case GroundType.SIDEWALK:
      return TileType.SIDEWALK;
    case GroundType.HOLE:
      return TileType.HOLE;
  }
}

function tileForStructure(structure: StructureType): TileType {
  switch (structure) {
    case StructureType.NONE:
    case StructureType.BRIDGE_HORIZONTAL:
      return TileType.FLOOR;
    case StructureType.WALL:
    case StructureType.WORKSHOP:
    case StructureType.WORKSHOP_FOOTPRINT:
      return TileType.WALL;
    case StructureType.HOLOWALL:
      return TileType.HOLOWALL;
    case StructureType.DOOR_CLOSED:
      return TileType.DOOR_CLOSED;
    case StructureType.DOOR_OPEN:
      return TileType.DOOR_OPEN;
    case StructureType.DOOR_LOCKED:
      return TileType.DOOR_LOCKED;
    case StructureType.TREE:
      return TileType.TREE;
    case StructureType.BUILDING:
      return TileType.BUILDING;
    case StructureType.FENCE:
      return TileType.FENCE;
    case StructureType.RUBBLE:
      return TileType.RUBBLE;
  }
}

function tileForFixture(fixture: FixtureType): TileType {
  switch (fixture) {
    case FixtureType.NONE:
    case FixtureType.STAIRS:
    case FixtureType.GARDEN:
    case FixtureType.CRATE:
    case FixtureType.FLOWERS:
      return TileType.FLOOR;
    case FixtureType.STAIRS_DOWN:
    case FixtureType.CAVE_MOUTH:
      return TileType.STAIRS_DOWN;
    case FixtureType.STAIRS_UP:
      return TileType.STAIRS_UP;
    case FixtureType.LIGHT:
      return TileType.LIGHT;
  }
}
