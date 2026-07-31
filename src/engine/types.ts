// Type-only imports: concrete classes live in core/. Imported as types so
// types.ts stays free of runtime dependencies.
import type { EntityManager } from "./core/entity-manager";
import type { TileSource } from "./core/tile-source";

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
  ASPHALT = 8,
  SIDEWALK = 9,
  GRASS = 10,
  WEEDS = 11,
  PARK_PATH = 12,
  TREE = 13,
  BUILDING = 14,
  FENCE = 15,
  RUBBLE = 16,
  /** A wall deployed from a holowall item: solid, opaque, and indestructible. */
  HOLOWALL = 17,
  /** A streetlight fixture: walkable, casts a warm glow. Surface-only source. */
  LIGHT = 18,
  /** Static water terrain: blocks walking, remains transparent to sight. */
  WATER_SHALLOW = 19,
  WATER_DEEP = 20,
  WATER_RIVER = 21,
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
  SKULKER = "skulker",
  UTILITY_BOT = "utility-bot",
  // New creatures (see src/engine/content/monster-defs.ts for stats/behavior).
  GIANT_SPIDER = "giant-spider",
  WILD_DOG = "wild-dog",
  ICKY_LUMP = "icky-lump",
  SNAGGLEPUSS = "snagglepuss",
  FLUTTERBANG = "flutterbang",
  MOPPET = "moppet",
  CYBERCOP = "cybercop",
  ZYTH = "zyth",
  TENTACULAR_HORROR = "tentacular-horror",
  TERRORIST_COLLABORATOR = "terrorist-collaborator",
  DREADNAUGHT = "dreadnaught",
}

export enum ItemType {
  PISTOL = "pistol",
  AMMO = "ammo",
  MEDKIT = "medkit",
  KEYCARD = "keycard",
  GRENADE = "grenade",
  LAND_MINE = "land-mine",
  CTDM = "ctdm",
  POWERCELL = "powercell",
  // New items (see src/engine/content/item-defs.ts for metadata/behavior).
  BUTCHER_KNIFE = "butcher-knife",
  LASER_PISTOL = "laser-pistol",
  GYROJET_SMG = "gyrojet-smg",
  GYROJET_SHOTGUN = "gyrojet-shotgun",
  MACRO_METAL_SWORD = "macro-metal-sword",
  VIBRA_SWORD = "vibra-sword",
  MACROMETAL_JACKET = "macrometal-jacket",
  PANIC_BUTTON = "panic-button",
  HOLOWALL = "holowall",
  BONE = "bone",
  COOKIE = "cookie",
  BLACK_PILL = "black-pill",
  COIN = "coin",
  ROCK = "rock",
  RUBBLE_CHUNK = "rubble-chunk",
  TRASH = "trash",
  METAL_SCRAPS = "metal-scraps",
  VENDING_MACHINE = "vending-machine",
  /** Held tool that mines walls into placeable blocks and places them back. */
  MATTER_MANIPULATOR = "matter-manipulator",
  /** Placeable blocks/fixtures recovered by mining (see content/block-defs.ts). */
  WALL_BLOCK = "wall-block",
  BUILDING_BLOCK = "building-block",
  FENCE_BLOCK = "fence-block",
  DOOR = "door",
  TREE_ITEM = "tree-item",
  LIGHT_FIXTURE = "light-fixture",
  /** A captured static-water cell placed by the Matter Manipulator. */
  WATER = "water",
  BLOOD_SPLATTER = "blood-splatter",
  CORPSE = "corpse",
  ENTRAILS = "entrails",
}

export enum WeaponType {
  MELEE = "melee",
  PISTOL = "pistol",
  GRENADE = "grenade",
  LAND_MINE = "land-mine",
  // New ranged firing modes.
  LASER = "laser",
  SMG = "smg",
  SHOTGUN = "shotgun",
}

export type MultiplayerMode = "offline" | "online";
export type LevelKind = "outside" | "dungeon";

export interface MultiplayerState {
  mode: MultiplayerMode;
  localPlayerId: string;
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

export interface InventorySlot {
  type: ItemType | null;
}

export const INVENTORY_BAR_SIZE = 12;
export const INVENTORY_EXTENDED_ROWS = 2;
export const INVENTORY_TOTAL_SLOTS =
  INVENTORY_BAR_SIZE * (1 + INVENTORY_EXTENDED_ROWS); // 36

export const STACKABLE_ITEMS: ItemType[] = [
  ItemType.AMMO,
  ItemType.GRENADE,
  ItemType.LAND_MINE,
  ItemType.KEYCARD,
  ItemType.POWERCELL,
  ItemType.MEDKIT,
  // New stackable collectibles (counts tracked in Player.itemCounts).
  ItemType.BONE,
  ItemType.COOKIE,
  ItemType.COIN,
  ItemType.ROCK,
  ItemType.RUBBLE_CHUNK,
  ItemType.TRASH,
  ItemType.METAL_SCRAPS,
  ItemType.HOLOWALL,
  ItemType.WALL_BLOCK,
  ItemType.BUILDING_BLOCK,
  ItemType.FENCE_BLOCK,
  ItemType.DOOR,
  ItemType.TREE_ITEM,
  ItemType.LIGHT_FIXTURE,
  ItemType.WATER,
];

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
  hasCTDM: boolean;
  ctdmEnabled: boolean;
  ctdmCharge: number;
  ctdmChargeMax: number;
  /** Whether the player has found the Matter Manipulator tool. */
  hasMatterManipulator: boolean;
  /** Whether the Matter Manipulator is currently equipped/active (F to toggle). */
  matterManipulatorActive: boolean;
  inventorySlots: InventorySlot[];
  selectedBarSlot: number;
  /** Counts for miscellaneous stackable items (coins, bones, rocks, ...). */
  itemCounts: Partial<Record<ItemType, number>>;
  /** Flat damage reduction from armor (e.g. macrometal jacket). */
  armor: number;
  /** Laser weapon charge (drains per shot, refilled by power cells). */
  laserCharge: number;
  laserChargeMax: number;
  /** Panic-button charge (consumed on warp, refilled by power cells). */
  panicCharge: number;
  panicChargeMax: number;
  /** While `sim.nowTick < slowUntilTick`, the player moves at reduced speed. */
  slowUntilTick?: number;
}

export interface Monster extends BaseEntity {
  kind: EntityKind.MONSTER;
  type: MonsterType;
  hpMax: number;
  hp: number;
  dmg: number;
  grenades: number;
  landMines: number;
  bullets: number;
  /** Primary weapon equipped by weapon-adaptive monsters. */
  equippedWeapon?: ItemType;
  /** Remaining charge for an equipped laser pistol. */
  laserCharge?: number;
  carriedItems: CarriedItem[];
  alertLevel?: number;
  lastKnownPlayerX?: number;
  lastKnownPlayerY?: number;
  lastAttackerId?: string;
  /** Most recent tick when this monster was damaged by a player. */
  lastPlayerAttackTick?: number;
  /** Mutants remain stationary while the current tick is below this value. */
  digestingUntilTick?: number;
  /** Befriended (e.g. a dog given a bone): fights for and follows its owner. */
  friendly?: boolean;
  /** Player id this creature is loyal to (when friendly). */
  ownerId?: string;
  /** Player-given name (shown in the log for a friendly pet's actions). */
  name?: string;
  /** Current pursuit target used to pace Wild Dog vocalizations. */
  dogVocalTargetId?: string;
  /** Simulation tick of this Wild Dog's most recent vocalization. */
  lastDogVocalTick?: number;
  /** Simulation tick of this friendly dog's most recent whimper. */
  lastDogWhimperTick?: number;
  /** Simulation tick of this Snagglepuss's most recent ambient mutter. */
  lastSnagglepussMutterTick?: number;
  /** Whether this Giant Spider was within ambient-audio range last update. */
  spiderAmbienceNearby?: boolean;
  /** Simulation tick of this Giant Spider's most recent ambient sound. */
  lastSpiderAmbienceTick?: number;
  /** Whether this Icky Lump was approaching within audio range last update. */
  ickyLumpMovementNearby?: boolean;
  /** Simulation tick of this Icky Lump's most recent movement sound. */
  lastIckyLumpMovementTick?: number;
  /** Simulation tick when this Dreadnaught should next emit ambience. */
  nextDreadnaughtAmbienceTick?: number;
  /** Simulation tick when this Flutterbang should next emit ambience. */
  nextFlutterbangAmbienceTick?: number;
  /** A thief (snagglepuss/moppet) that grabbed loot is now running away. */
  fleeing?: boolean;
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

export type ProjectileType = "bullet" | "laser";

export interface BeamPoint {
  x: number;
  y: number;
}

export interface Bullet extends BaseEntity {
  kind: EntityKind.BULLET;
  damage: number;
  ownerId: string;
  maxDistance: number;
  traveledDistance: number;
  fuseSeconds: number;
  ricochetCount: number;
  maxRicochets: number;
  ownerGraceSeconds: number;
  projectileType?: ProjectileType;
  trailPoints?: BeamPoint[];
}

export interface Explosive extends BaseEntity {
  kind: EntityKind.EXPLOSIVE;
  type: ItemType.GRENADE | ItemType.LAND_MINE;
  armed: boolean;
  fuseTicks?: number;
  ownerId?: string;
  ignoreOwnerTicks?: number;
  targetWorldX?: number;
  targetWorldY?: number;
  landingWorldX?: number;
  landingWorldY?: number;
  hasLanded: boolean;
  landingBounceCooldownTicks: number;
  ricochetCount: number;
}

export interface Effect {
  id: string;
  type: "explosion" | "spark" | "hit_flash" | "laser_beam";
  worldX: number;
  worldY: number;
  ageTicks: number;
  durationTicks: number;
  velocityX?: number;
  velocityY?: number;
  entityId?: string;
  beamPoints?: BeamPoint[];
}

export type Entity = Player | Monster | Item | Bullet | Explosive;

/** A sound queued by the simulation, optionally positioned in the game world. */
export interface SoundCue {
  effect: string;
  worldX?: number;
  worldY?: number;
  sourceId?: string;
  /** Overrides the normal 18-tile spatial-audio falloff distance. */
  maxDistancePx?: number;
  /** Volume retained at and beyond maxDistancePx, from 0 to 1. */
  minimumVolumeScale?: number;
}

// ========================================
// Simulation System (NEW)
// ========================================

// Time scaling constants
export const SLOWMO_SCALE = 0.05; // 5% speed during slowdown
export const REAL_TIME_SPEED = 1.0; // 100% base speed for real-time
export const TIME_SCALE_TRANSITION_SPEED = 0.05; // Interpolation speed per frame
// Multiplayer runs at a fixed, slightly-relaxed real-time pace (no CTDM).
export const ONLINE_TIME_SCALE = 0.8;

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
  REPAIR = "REPAIR",
  /** Left-click: use whatever item is active (fire, eat, throw, place, ...). */
  USE_ITEM = "USE_ITEM",
  /** Matter Manipulator: mine the targeted wall back into a placeable block. */
  MINE = "MINE",
  /** Matter Manipulator: place a wall block from the inventory at a tile. */
  PLACE_BLOCK = "PLACE_BLOCK",
  /** Matter Manipulator: raise or lower one semantic terrain cell. */
  SHAPE_TERRAIN = "SHAPE_TERRAIN",
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
  | {
      type: "FIRE";
      dx: number;
      dy: number;
      weapon?: WeaponType;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | { type: "WAIT" }
  | { type: "PICKUP" }
  | { type: "INTERACT"; x: number; y: number }
  | { type: "RELOAD" }
  | { type: "DESCEND" }
  | { type: "ASCEND" }
  | { type: "REPAIR"; x: number; y: number }
  | {
      type: "USE_ITEM";
      dx: number;
      dy: number;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | { type: "MINE"; tileX: number; tileY: number }
  | { type: "PLACE_BLOCK"; tileX: number; tileY: number; itemType: ItemType }
  | { type: "SHAPE_TERRAIN"; tileX: number; tileY: number; delta: -1 | 1 };

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
      knockbackX?: number;
      knockbackY?: number;
      knockbackDistance?: number;
    }
  | {
      type: "DEATH";
      entityId: string;
      fromExplosion?: boolean;
      sourceId?: string;
    }
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
  width: number;
  height: number;
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
  worldSpaceId: string;
  worldPlaneId: string;
  levelKind: LevelKind;
  mapWidth: number;
  mapHeight: number;
  floorVariant: number;
  wallSet: WallSet;
  /** Durable per-game seed for deterministic keyed rolls (never changes). */
  simulationSeed: number;
  mapDirty: boolean;
  // Canonical tile accessor. Generated levels expose their WorldPlane here.
  tiles: TileSource;
  /** Authoritative compositional storage for the active world plane. */
  worldPlane: import("./core/world-plane").WorldPlane;
  portals: import("./core/world-space").WorldPortal[];
  visible: Set<number>;
  explored: Set<number>;
  accessible: Set<number>;
  enhancedVision: boolean;
  visibilityByPlayer: Map<string, Set<number>>;
  exploredByPlayer: Map<string, Set<number>>;
  entities: Entity[];
  // Owns entity add/remove and lifecycle tracking. Shares its array with
  // `entities` above (same reference, mutated in place). Runtime-only —
  // never serialized.
  entityManager: EntityManager;
  players: Player[];
  player: Player;
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  // Where a fresh player enters this level (same tile single-player starts on).
  // Network players spawn here so multiplayer matches single-player placement.
  playerStart: [number, number];
  story: string[];
  options: {
    fov: boolean;
    godMode: boolean;
  };
  effects: Effect[];
  multiplayer: MultiplayerState;
  // NEW: Simulation system
  sim: SimulationState;
  commandsByTick: Map<number, Command[]>;
  eventQueue: GameEvent[];
  shouldDescend: boolean;
  shouldAscend: boolean;
  descendTarget?: [number, number];
  pendingPortalId?: string;
  /** Transient topology changes awaiting physics-collider synchronization. */
  changedTiles?: Set<number>;
  holeCreatedTiles?: Set<number>; // Track newly created holes for fall-through checks
  /** Sound effects queued during simulation for local or network playback. */
  pendingSounds: SoundCue[];
  /** Development-only visual slice; never serialized into production saves. */
  terrainPrototype?: import("./systems/terrain/terrain-prototype").TerrainPrototypePlane;
  /**
   * Transient: id of a pet that just became friendly and is awaiting a name.
   * The client shows a naming modal (and pauses) when this is set, then clears
   * it. Not serialized.
   */
  pendingDogNaming?: string;
  /**
   * Transient: items that fell through a hole this tick. The Game harvests these
   * and deposits them onto the level below. Not serialized.
   */
  itemsFellThrough?: Array<{ type: ItemType; amount?: number; heal?: number }>;
}

// ========================================
// Serialized Save State
// ========================================

export interface SerializedState {
  depth: number;
  worldSpaceId: string;
  worldPlaneId: string;
  levelKind: LevelKind;
  /** Durable per-game seed for deterministic keyed rolls. */
  simulationSeed: number;
  plane: SerializedWorldPlane;
  portals: import("./core/world-space").WorldPortal[];
  floorVariant: number;
  wallSet: WallSet;
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  player: Player;
  players: Player[];
  entities: Entity[];
  explored: number[];
  enhancedVision: boolean;
  godMode: boolean;
  exploredByPlayer: Record<string, number[]>;
  story: string[];
  levels: SerializedLevelState[];
  multiplayer: {
    mode: MultiplayerMode;
    localPlayerId: string;
  };
  // NEW: Save simulation state
  sim: {
    nowTick: number;
    mode: "PLANNING" | "REALTIME";
    timeScale: number;
    targetTimeScale: number;
  };
  sounds: SoundCue[]; // Sound effects to play on receiving client
  effects: Effect[]; // Visual effects (explosions, etc.)
}

export interface SerializedLevelState {
  depth: number;
  worldSpaceId: string;
  worldPlaneId: string;
  levelKind: LevelKind;
  plane: SerializedWorldPlane;
  portals: import("./core/world-space").WorldPortal[];
  floorVariant: number;
  wallSet: WallSet;
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  explored: number[];
  exploredByPlayer: Record<string, number[]>;
  entities: Entity[];
  enhancedVision: boolean;
}

export interface SerializedWorldPlane {
  width: number;
  height: number;
  ground: number[];
  structure: number[];
  fixture: number[];
  elevation: number[];
  damage: number[];
}

// ========================================
// Constants
// ========================================

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 36;
export const OUTSIDE_MAP_WIDTH = 128;
export const OUTSIDE_MAP_HEIGHT = 72;

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
  [TileType.ASPHALT]: {
    ch: ".",
    color: "#3b3f46",
    bg: "#16191e",
    block: false,
    opaque: false,
  },
  [TileType.SIDEWALK]: {
    ch: ".",
    color: "#8a8d83",
    bg: "#2c302d",
    block: false,
    opaque: false,
  },
  [TileType.GRASS]: {
    ch: ",",
    color: "#4f7b43",
    bg: "#1d2b1d",
    block: false,
    opaque: false,
  },
  [TileType.WEEDS]: {
    ch: '"',
    color: "#6f9b4f",
    bg: "#21321f",
    block: false,
    opaque: false,
  },
  [TileType.PARK_PATH]: {
    ch: ".",
    color: "#736d59",
    bg: "#2d2a22",
    block: false,
    opaque: false,
  },
  [TileType.TREE]: {
    ch: "T",
    color: "#496f34",
    bg: "#182316",
    block: true,
    opaque: true,
  },
  [TileType.BUILDING]: {
    ch: "#",
    color: "#586070",
    bg: "#171a20",
    block: true,
    opaque: true,
  },
  [TileType.FENCE]: {
    ch: "|",
    color: "#737b7f",
    bg: "#171a20",
    block: true,
    opaque: false,
  },
  [TileType.RUBBLE]: {
    ch: "%",
    color: "#6b6259",
    bg: "#211f1c",
    block: true,
    opaque: false,
  },
  [TileType.HOLOWALL]: {
    ch: "#",
    color: "#5fe7e7",
    bg: "#0b2a2c",
    block: true,
    opaque: true,
  },
  [TileType.LIGHT]: {
    ch: "!",
    color: "#ffd670",
    bg: "#2c302d",
    block: false,
    opaque: false,
  },
  [TileType.WATER_SHALLOW]: {
    ch: "~",
    color: "#58c7d8",
    bg: "#174e69",
    block: true,
    opaque: false,
  },
  [TileType.WATER_DEEP]: {
    ch: "≈",
    color: "#3da8c7",
    bg: "#123b59",
    block: true,
    opaque: false,
  },
  [TileType.WATER_RIVER]: {
    ch: "~",
    color: "#6bd8df",
    bg: "#174e69",
    block: true,
    opaque: false,
  },
};
