// ========================================
// Tile Types and Definitions
// ========================================

export enum TileType {
  WALL = 0,
  FLOOR = 1,
  DOOR_CLOSED = 2,
  DOOR_OPEN = 3,
  DOOR_LOCKED = 4,
  STAIRS_DOWN = 5,
  STAIRS_UP = 6,
  HOLE = 7,
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
  EXPLOSIVE = "explosive",
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
  GRENADE = "grenade",
  LAND_MINE = "land-mine",
}

export enum WeaponType {
  MELEE = "melee",
  PISTOL = "pistol",
  GRENADE = "grenade",
  LAND_MINE = "land-mine",
}

// ========================================
// Entity Interfaces
// ========================================

// Note: Entity types now reference class instances from entity factories
// The x, y properties are getters that return gridX, gridY
// Actual entities extend GameObject with worldX, worldY as source of truth

export interface BaseEntity {
  id: string;
  kind: EntityKind;
  gridX: number; // Derived from worldX (getter in GameObject)
  gridY: number; // Derived from worldY (getter in GameObject)
  nextActTick?: number;

  // Continuous world coordinates (source of truth)
  worldX: number;
  worldY: number;
  prevWorldX: number;
  prevWorldY: number;

  // Velocity
  velocityX: number;
  velocityY: number;

  // Facing direction
  facingAngle: number;

  // Physics body (set and managed by physics system)
  physicsBody?: any; // Body from detect-collisions
}

export interface Player extends BaseEntity {
  kind: EntityKind.PLAYER;
  hpMax: number;
  hp: number;
  sight: number;
  weapon: WeaponType;
  ammo: number;
  ammoReserve: number;
  keys: number;
  score: number;
  grenades: number;
  landMines: number;
}

export interface Monster extends BaseEntity {
  kind: EntityKind.MONSTER;
  type: MonsterType;
  hpMax: number;
  hp: number;
  dmg: number;
  grenades: number;
  landMines: number;
  carriedItems: CarriedItem[];
}

export interface CarriedItem {
  type: ItemType;
  amount?: number;
  heal?: number;
}

export interface Item extends BaseEntity {
  kind: EntityKind.ITEM;
  type: ItemType;
  name: string;
  amount?: number;
  heal?: number;
}

export interface Bullet extends BaseEntity {
  kind: EntityKind.BULLET;
  damage: number;
  ownerId: string;
  maxDistance: number;
  traveledDistance: number;
}

export interface Explosive extends BaseEntity {
  kind: EntityKind.EXPLOSIVE;
  type: ItemType.GRENADE | ItemType.LAND_MINE;
  armed: boolean;
  fuseTicks?: number;
  ownerId?: string;
  ignoreOwnerTicks?: number;
}

export interface Effect {
  id: string;
  type: "explosion";
  worldX: number;
  worldY: number;
  ageTicks: number;
  durationTicks: number;
}

export type Entity = Player | Monster | Item | Bullet | Explosive;

// ========================================
// Simulation System (NEW)
// ========================================

// Time scaling constants
export const SLOWMO_SCALE = 0.05; // 5% speed during slowdown
export const REAL_TIME_SPEED = 1.0; // 100% base speed for real-time
export const TIME_SCALE_TRANSITION_SPEED = 0.05; // Interpolation speed per frame

export interface SimulationState {
  nowTick: number;
  mode: "PLANNING" | "REALTIME";
  timeScale: number; // Current time scale (0.01 to 1.0)
  targetTimeScale: number; // Desired time scale for smooth transitions
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
  ASCEND = "ASCEND",
}

export interface Command {
  id: string;
  tick: number;
  actorId: string;
  type: CommandType;
  data: CommandData;
  priority: number;
  source: "PLAYER" | "AI" | "SYSTEM";
}

export type CommandData =
  | { type: "MOVE"; dx: number; dy: number }
  | { type: "MELEE"; targetId: string }
  | { type: "FIRE"; dx: number; dy: number; weapon?: WeaponType }
  | { type: "WAIT" }
  | { type: "PICKUP" }
  | { type: "INTERACT"; x: number; y: number }
  | { type: "RELOAD" }
  | { type: "DESCEND" }
  | { type: "ASCEND" };

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
  id: string;
  type: EventType;
  data: EventData;
  cause?: string;
  depth: number;
}

export type EventData =
  | {
      type: "DAMAGE";
      targetId: string;
      amount: number;
      sourceId?: string;
      fromExplosion?: boolean;
      suppressHitSound?: boolean;
    }
  | { type: "DEATH"; entityId: string; fromExplosion?: boolean }
  | { type: "EXPLOSION"; x: number; y: number; radius: number; damage: number }
  | { type: "DROP_LOOT"; x: number; y: number; itemType: ItemType }
  | { type: "MESSAGE"; message: string }
  | { type: "DOOR_OPEN"; x: number; y: number }
  | { type: "PICKUP_ITEM"; actorId: string; itemId: string }
  | { type: "PLAYER_DEATH"; playerId: string }
  | { type: "NPC_TALK"; npcId: string; message: string };

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
  floorVariant: number;
  wallSet: WallSet;
  start: [number, number];
  stairsDown: [number, number];
  rooms: Room[];
}

// ========================================
// Game State
// ========================================

export interface GameState {
  depth: number;
  map: TileType[];
  floorVariant: number;
  wallSet: WallSet;
  wallDamage: number[];
  mapDirty: boolean;
  visible: Set<number>;
  explored: Set<number>;
  accessible: Set<number>;
  enhancedVision: boolean;
  entities: Entity[];
  player: Player;
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  log: string[];
  options: {
    fov: boolean;
  };
  effects: Effect[];
  // NEW: Simulation system
  sim: SimulationState;
  commandsByTick: Map<number, Command[]>;
  eventQueue: GameEvent[];
  shouldDescend: boolean;
  shouldAscend: boolean;
  descendTarget?: [number, number];
  changedTiles?: Set<number>; // Track tiles that changed for physics updates
  holeCreatedTiles?: Set<number>; // Track newly created holes for fall-through checks
}

// ========================================
// Serialized Save State
// ========================================

export interface SerializedState {
  depth: number;
  map: TileType[];
  floorVariant?: number;
  wallSet?: WallSet;
  wallDamage?: number[];
  stairsDown: [number, number];
  stairsUp?: [number, number] | null;
  player: Player;
  entities: Entity[];
  explored: number[];
  enhancedVision?: boolean;
  log: string[];
  levels?: SerializedLevelState[];
  // NEW: Save simulation state
  sim: {
    nowTick: number;
    mode: "PLANNING" | "REALTIME";
  };
}

export interface SerializedLevelState {
  depth: number;
  map: TileType[];
  floorVariant: number;
  wallDamage: number[];
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  explored: number[];
  entities: Entity[];
}

// ========================================
// Constants
// ========================================

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 36;

export type WallSet = "concrete" | "wood";

/**
 * Cumulative damage thresholds (in hits) that drive tile rendering states.
 *
 * - 0–2: no visible damage
 * - 3–5: light damage (first damaged sprite/overlay)
 * - 6–8: heavy damage (second, more damaged sprite/overlay)
 *
 * Values at or above *_MAX_DAMAGE should be treated as fully destroyed.
 */
export const WALL_DAMAGE_THRESHOLDS = [3, 6];
export const WALL_MAX_DAMAGE = 9;
export const FLOOR_DAMAGE_THRESHOLDS = [3, 6];
export const FLOOR_MAX_DAMAGE = 9;
export const HOLE_FALL_DAMAGE = 3;

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
  [TileType.STAIRS_DOWN]: {
    ch: ">",
    color: "#7bd88f",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
  [TileType.STAIRS_UP]: {
    ch: "<",
    color: "#7bd88f",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
  [TileType.HOLE]: {
    ch: "O",
    color: "#14171d",
    bg: "#0b0e12",
    block: false,
    opaque: false,
  },
};
