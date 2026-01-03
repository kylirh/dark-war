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
  MONSTER = "monster",
  BULLET = "bullet",
  ITEM = "item",
}

export enum MonsterType {
  MUTANT = "mutant",
  RAT = "rat",
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
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  nextActTick?: number;
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
  type: MonsterType;
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
// Simulation System (NEW)
// ========================================

export interface SimulationState {
  nowTick: number;
  mode: "PLANNING" | "REALTIME";
  isPaused: boolean;
  accumulatorMs: number;
  lastFrameMs: number;
  pauseReasons: Set<string>;
}

export enum CommandType {
  MOVE = "MOVE",
  MELEE = "MELEE",
  FIRE = "FIRE",
  WAIT = "WAIT",
  PICKUP = "PICKUP",
  INTERACT = "INTERACT",
  RELOAD = "RELOAD",
  DESCEND = "DESCEND",
}

export interface Command {
  id: number;
  tick: number;
  actorId: number;
  type: CommandType;
  data: CommandData;
  priority: number;
  source: "PLAYER" | "AI" | "SYSTEM";
}

export type CommandData =
  | { type: "MOVE"; dx: number; dy: number }
  | { type: "MELEE"; targetId: number }
  | { type: "FIRE"; dx: number; dy: number }
  | { type: "WAIT" }
  | { type: "PICKUP"; itemId: number }
  | { type: "INTERACT"; x: number; y: number }
  | { type: "RELOAD" }
  | { type: "DESCEND" };

export enum EventType {
  DAMAGE = "DAMAGE",
  DEATH = "DEATH",
  EXPLOSION = "EXPLOSION",
  DROP_LOOT = "DROP_LOOT",
  MESSAGE = "MESSAGE",
  DOOR_OPEN = "DOOR_OPEN",
  PICKUP_ITEM = "PICKUP_ITEM",
  PLAYER_DEATH = "PLAYER_DEATH",
  NPC_TALK = "NPC_TALK",
}

export interface GameEvent {
  id: number;
  type: EventType;
  data: EventData;
  cause?: number;
  depth: number;
}

export type EventData =
  | { type: "DAMAGE"; targetId: number; amount: number; sourceId?: number }
  | { type: "DEATH"; entityId: number }
  | { type: "EXPLOSION"; x: number; y: number; radius: number; damage: number }
  | { type: "DROP_LOOT"; x: number; y: number; itemType: ItemType }
  | { type: "MESSAGE"; message: string }
  | { type: "DOOR_OPEN"; x: number; y: number }
  | { type: "PICKUP_ITEM"; actorId: number; itemId: number }
  | { type: "PLAYER_DEATH"; playerId: number }
  | { type: "NPC_TALK"; npcId: number; message: string };

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
  // NEW: Simulation system
  sim: SimulationState;
  commandsByTick: Map<number, Command[]>;
  eventQueue: GameEvent[];
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
  // NEW: Save simulation state
  sim: {
    nowTick: number;
    mode: "PLANNING" | "REALTIME";
  };
}

// ========================================
// Constants
// ========================================

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 36;

export const CELL_CONFIG = {
  w: 32,
  h: 32,
  padX: 16,
  padY: 16,
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
