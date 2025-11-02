// ========================================
// Tile Types and Definitions
// ========================================

export enum TileType {
  WALL = 0,
  FLOOR = 1,
  DOOR_CLOSED = 2,
  DOOR_OPEN = 3,
  DOOR_LOCKED = 4,
  STAIRS = 5,
}

export interface TileDefinition {
  ch: string;
  color: string;
  bg: string;
  block: boolean;
  opaque: boolean;
}

// ========================================
// Entity Types
// ========================================

export enum EntityKind {
  PLAYER = "player",
  MONSTER = "mutant",
  BULLET = "bullet",
  ITEM = "item",
}

export enum ItemType {
  PISTOL = "pistol",
  AMMO = "ammo",
  MEDKIT = "medkit",
  KEYCARD = "keycard",
}

// ========================================
// Entity Interfaces
// ========================================

export interface BaseEntity {
  kind: EntityKind;
  x: number;
  y: number;
  ch: string;
  color: string;
}

export interface Player extends BaseEntity {
  kind: EntityKind.PLAYER;
  hpMax: number;
  hp: number;
  sight: number;
  weapon: ItemType;
  ammo: number;
  ammoReserve: number;
  keys: number;
  score: number;
}

export interface Monster extends BaseEntity {
  kind: EntityKind.MONSTER;
  hp: number;
  dmg: number;
}

export interface Item extends BaseEntity {
  kind: EntityKind.ITEM;
  type: ItemType;
  name: string;
  amount?: number;
  heal?: number;
}

export type Entity = Player | Monster | Item;

// ========================================
// Map and Room Types
// ========================================

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DungeonData {
  map: TileType[];
  start: [number, number];
  stairs: [number, number];
  rooms: Room[];
}

// ========================================
// Game State
// ========================================

export interface GameState {
  depth: number;
  map: TileType[];
  visible: Set<number>;
  explored: Set<number>;
  entities: Entity[];
  player: Player;
  stairs: [number, number];
  log: string[];
  options: {
    fov: boolean;
  };
}

// ========================================
// Serialized Save State
// ========================================

export interface SerializedState {
  depth: number;
  map: TileType[];
  stairs: [number, number];
  player: Player;
  entities: Entity[];
  explored: number[];
  log: string[];
}

// ========================================
// Constants
// ========================================

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 36;

export const CELL_CONFIG = {
  w: 15,
  h: 16,
  padX: 8,
  padY: 8,
};

export const TILE_DEFINITIONS: Record<TileType, TileDefinition> = {
  [TileType.WALL]: {
    ch: "#",
    color: "#2b3342",
    bg: "#0b0e12",
    block: true,
    opaque: true,
  },
  [TileType.FLOOR]: {
    ch: "·",
    color: "#2c89c9",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
  [TileType.DOOR_CLOSED]: {
    ch: "+",
    color: "#caa472",
    bg: "#0b0e12",
    block: true,
    opaque: true,
  },
  [TileType.DOOR_OPEN]: {
    ch: "/",
    color: "#caa472",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
  [TileType.DOOR_LOCKED]: {
    ch: "×",
    color: "#d08770",
    bg: "#0b0e12",
    block: true,
    opaque: true,
  },
  [TileType.STAIRS]: {
    ch: "<",
    color: "#7bd88f",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
};
