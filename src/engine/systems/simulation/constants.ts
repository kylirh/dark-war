import { ItemType, CELL_CONFIG } from "../../types";

// ========================================
// Constants
// ========================================

/**
 * Fixed length of a single simulation tick, in milliseconds — 20 ticks/second.
 *
 * This is the conversion factor between the two time units the simulation
 * mixes. Every other duration constant in this file is counted in **ticks**,
 * while speeds are in **pixels per second**, so crossing between them always
 * goes through this value:
 *
 * - real seconds to ticks — `Math.ceil(30_000 / SIM_DT_MS)` for a 30s cooldown
 * - velocity to per-tick displacement — `worldX += velocityX * (SIM_DT_MS / 1000)`
 *
 * It is also the fixed step both drivers accumulate against: the client's
 * `while (accumulatorMs >= SIM_DT_MS)` loop and the server's tick interval.
 * Changing it rescales every tick-denominated constant in the game.
 */
export const SIM_DT_MS = 50; // 20 ticks/second
export const MONSTER_ACTION_DELAY = 5; // Monsters act every N ticks (player acts every 1)
export const MONSTER_AI_UPDATE_INTERVAL = 5; // Update monster velocities every 5 ticks (~4 Hz)
export const MONSTER_SPEED = 225; // pixels per second
export const MONSTER_ARRIVAL_RADIUS = CELL_CONFIG.w * 1.5; // Stop when within 1.5 tiles for attack
export const MONSTER_ITEM_PICKUP_CHANCE = 0.85; // 85% chance to pick up items when overlapping
export const MAX_EVENTS_PER_TICK = 1000;
export const MAX_COMMANDS_PER_TICK = 1000;
/** World-speed multiplier while every living player on a plane is resting. */
export const REST_TIME_SCALE = 8;
/** Resting restores one health point every 1.5 seconds of simulated time. */
export const REST_HEAL_INTERVAL_TICKS = 30;
/** Sleeping players take twice as much incoming damage. */
export const REST_DAMAGE_MULTIPLIER = 2;
export const GRENADE_FUSE_TICKS = 14; // ~0.7s at 20 ticks/sec
export const EXPLOSIVE_OWNER_GRACE_TICKS = 6;
export const MELEE_ARC = Math.PI / 3;
export const LANDED_GRENADE_BOUNCE_SPEED = 80;
export const LANDED_GRENADE_MAX_OFFSET = CELL_CONFIG.w * 0.35;
export const MELEE_KNOCKBACK_DISTANCE = 7;
export const MONSTER_ALERT_DECAY = 5; // Alert decreases per steering update (every 5 ticks)
export const FLEE_HP_RATIO = 0.25; // Flee when HP drops below 25% of max
export const SKULKER_MIN_RANGE_PX = CELL_CONFIG.w * 2.5; // 80px: retreat if player closer
export const SKULKER_MAX_RANGE_PX = CELL_CONFIG.w * 5.5; // 176px: advance if player farther
export const SKULKER_SHOOT_COOLDOWN = 12; // ticks between shots (~600ms at 20 ticks/sec)
export const SKULKER_BULLET_SPEED = 500; // px/s
export const SKULKER_SHOT_VARIANCE = Math.PI / 12; // ±15 degrees
export const SKULKER_MAX_BULLETS = 12;
export const SKULKER_LOW_AMMO_THRESHOLD = 3;
export const SKULKER_SHOOT_MAX_RANGE_PX = CELL_CONFIG.w * 10; // 320px = 10 tiles
export const EXPLOSION_KNOCKBACK_MAX_DISTANCE = 34;
export const EXPLOSION_KNOCKBACK_MIN_DISTANCE = 14;
export const IDLE_WANDER_SPEED = MONSTER_SPEED * 0.5;
export const UTILITY_BOT_SPEED = MONSTER_SPEED * 0.6;
export const UTILITY_BOT_FOLLOW_DIST_PX = CELL_CONFIG.w * 2.5; // ~80px follow offset from player
export const UTILITY_BOT_REPAIR_COOLDOWN = 8; // extra ticks between repairs
export const IDLE_WANDER_DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Reach of the Matter Manipulator, in tiles from the player's tile. */
export const MATTER_MANIPULATOR_RANGE = 6;
/** Broad but finite SNES-style shaping range for one visible 2D plane. */
export const MIN_EDITABLE_ELEVATION = -12;
export const MAX_EDITABLE_ELEVATION = 12;

export const EXPLOSIVE_CONFIG: Record<
  ItemType.GRENADE | ItemType.LAND_MINE,
  { radius: number; damage: number }
> = {
  [ItemType.GRENADE]: { radius: 2.5, damage: 6 },
  [ItemType.LAND_MINE]: { radius: 2, damage: 8 },
};
