/**
 * Sprite Configuration
 * Defines sprite sheet layout and coordinates for all game sprites
 * Uses Pixi.js for rendering with rich animation support
 */

import { TileType, MonsterType, ItemType } from "../types";

// Sprite coordinate interface
export interface SpriteCoordinate {
  x: number;
  y: number;
}

export type FacingDirection = "down" | "up" | "left" | "right";

// Sprite sheet configuration
export const SPRITE_SHEET_PATH = "assets/img/sprites.png";
export const SPRITE_SIZE = 32;
export const SPRITES_PER_ROW = 16;

/**
 * Sprite sheet coordinate map
 * Layout: 512×160 (16×5 tiles at 32×32)
 * Row 0: Tiles
 * Row 1: Player
 * Row 2: Monsters/Entities
 * Row 3: Items
 */
export const SPRITE_COORDS: Record<string, SpriteCoordinate> = {
  // ========================================
  // Row 0 - Tiles
  // ========================================
  [TileType.WALL]: { x: 0, y: 0 },
  wall_wood: { x: 10, y: 0 },
  [TileType.FLOOR]: { x: 1, y: 0 },
  [TileType.DOOR_CLOSED]: { x: 2, y: 0 },
  [TileType.DOOR_OPEN]: { x: 3, y: 0 },
  [TileType.DOOR_LOCKED]: { x: 2, y: 0 }, // Same sprite as closed door
  [TileType.HOLE]: { x: 14, y: 0 },
  [TileType.STAIRS_UP]: { x: 4, y: 0 },
  [TileType.STAIRS_DOWN]: { x: 5, y: 0 },
  wall_damaged_1: { x: 6, y: 0 },
  wall_damaged_2: { x: 7, y: 0 },
  wall_wood_damaged_1: { x: 11, y: 0 },
  wall_wood_damaged_2: { x: 12, y: 0 },
  floor_damaged: { x: 13, y: 0 },
  hole: { x: 14, y: 0 },
  [TileType.ASPHALT]: { x: 0, y: 4 },
  [TileType.SIDEWALK]: { x: 1, y: 4 },
  [TileType.GRASS]: { x: 2, y: 4 },
  [TileType.WEEDS]: { x: 3, y: 4 },
  [TileType.PARK_PATH]: { x: 4, y: 4 },
  [TileType.TREE]: { x: 5, y: 4 },
  [TileType.BUILDING]: { x: 6, y: 4 },
  [TileType.FENCE]: { x: 7, y: 4 },
  [TileType.RUBBLE]: { x: 8, y: 4 },
  megacorp_entrance: { x: 9, y: 4 },

  // ========================================
  // Row 1 - Player
  // ========================================
  player: { x: 0, y: 1 },
  player_dead: { x: 1, y: 1 },
  player_walk_down_1: { x: 2, y: 1 },
  player_walk_down_2: { x: 3, y: 1 },
  player_walk_side_1: { x: 4, y: 1 },
  player_walk_side_2: { x: 5, y: 1 },
  player_walk_up_1: { x: 6, y: 1 },
  player_walk_up_2: { x: 7, y: 1 },

  // ========================================
  // Row 2 - Monsters/Entities
  // ========================================
  [MonsterType.MUTANT]: { x: 0, y: 2 },
  [MonsterType.RAT]: { x: 1, y: 2 },
  [MonsterType.SKULKER]: { x: 1, y: 2 }, // Rat sprite, tinted green in renderer
  [MonsterType.UTILITY_BOT]: { x: 10, y: 2 },
  utility_bot_walk_1: { x: 11, y: 2 },
  utility_bot_walk_2: { x: 12, y: 2 },
  bullet: { x: 2, y: 2 },
  explosion_1: { x: 3, y: 2 },
  explosion_2: { x: 4, y: 2 },
  explosion_3: { x: 5, y: 2 },
  mutant_walk_1: { x: 6, y: 2 },
  mutant_walk_2: { x: 7, y: 2 },
  rat_walk_1: { x: 8, y: 2 },
  rat_walk_2: { x: 9, y: 2 },

  // ========================================
  // Row 3 - Items
  // ========================================
  [ItemType.PISTOL]: { x: 0, y: 3 },
  [ItemType.AMMO]: { x: 1, y: 3 },
  [ItemType.MEDKIT]: { x: 2, y: 3 },
  [ItemType.KEYCARD]: { x: 3, y: 3 },
  [ItemType.GRENADE]: { x: 4, y: 3 },
  [ItemType.LAND_MINE]: { x: 5, y: 3 },
  [ItemType.CTDM]: { x: 7, y: 3 },
  [ItemType.POWERCELL]: { x: 8, y: 3 },
  land_mine_active: { x: 6, y: 3 },

  // ========================================
  // Row 5/6 - New items (see tools/gen-spritesheet.mjs)
  // ========================================
  [ItemType.BUTCHER_KNIFE]: { x: 0, y: 5 },
  [ItemType.LASER_PISTOL]: { x: 1, y: 5 },
  [ItemType.GYROJET_SMG]: { x: 2, y: 5 },
  [ItemType.GYROJET_SHOTGUN]: { x: 3, y: 5 },
  [ItemType.MACRO_METAL_SWORD]: { x: 4, y: 5 },
  [ItemType.VIBRA_SWORD]: { x: 5, y: 5 },
  [ItemType.MACROMETAL_JACKET]: { x: 6, y: 5 },
  [ItemType.PANIC_BUTTON]: { x: 7, y: 5 },
  [ItemType.HOLOWALL]: { x: 8, y: 5 },
  [ItemType.BONE]: { x: 9, y: 5 },
  [ItemType.COOKIE]: { x: 10, y: 5 },
  [ItemType.BLACK_PILL]: { x: 11, y: 5 },
  [ItemType.COIN]: { x: 12, y: 5 },
  [ItemType.ROCK]: { x: 13, y: 5 },
  [ItemType.RUBBLE_CHUNK]: { x: 14, y: 5 },
  [ItemType.TRASH]: { x: 15, y: 5 },
  [ItemType.METAL_SCRAPS]: { x: 0, y: 6 },
  [ItemType.VENDING_MACHINE]: { x: 1, y: 6 },
  laser_bullet: { x: 2, y: 6 },

  // ========================================
  // Row 7 - New monsters
  // ========================================
  [MonsterType.GIANT_SPIDER]: { x: 0, y: 7 },
  [MonsterType.WILD_DOG]: { x: 1, y: 7 },
  [MonsterType.ICKY_LUMP]: { x: 2, y: 7 },
  [MonsterType.SNAGGLEPUSS]: { x: 3, y: 7 },
  [MonsterType.FLUTTERBANG]: { x: 4, y: 7 },
  [MonsterType.MOPPET]: { x: 5, y: 7 },
  [MonsterType.CYBERCOP]: { x: 6, y: 7 },
  [MonsterType.ZYTH]: { x: 7, y: 7 },
  [MonsterType.TENTACULAR_HORROR]: { x: 8, y: 7 },
  [MonsterType.TERRORIST_COLLABORATOR]: { x: 9, y: 7 },
  [MonsterType.DREADNAUGHT]: { x: 10, y: 7 },
};

export const FLOOR_VARIANTS: SpriteCoordinate[] = [
  SPRITE_COORDS[TileType.FLOOR],
  { x: 8, y: 0 },
  { x: 9, y: 0 },
];

export const EXPLOSION_FRAMES: SpriteCoordinate[] = [
  SPRITE_COORDS.explosion_1,
  SPRITE_COORDS.explosion_2,
  SPRITE_COORDS.explosion_3,
];

export const PLAYER_WALK_FRAMES: Record<FacingDirection, SpriteCoordinate[]> = {
  down: [SPRITE_COORDS.player_walk_down_1, SPRITE_COORDS.player_walk_down_2],
  up: [SPRITE_COORDS.player_walk_up_1, SPRITE_COORDS.player_walk_up_2],
  left: [SPRITE_COORDS.player_walk_side_1, SPRITE_COORDS.player_walk_side_2],
  right: [SPRITE_COORDS.player_walk_side_1, SPRITE_COORDS.player_walk_side_2],
};

export const PLAYER_IDLE_FRAMES: Record<FacingDirection, SpriteCoordinate> = {
  down: SPRITE_COORDS.player_walk_down_1,
  up: SPRITE_COORDS.player_walk_up_1,
  left: SPRITE_COORDS.player_walk_side_1,
  right: SPRITE_COORDS.player_walk_side_1,
};

export const MONSTER_WALK_FRAMES: Record<MonsterType, SpriteCoordinate[]> = {
  [MonsterType.MUTANT]: [
    SPRITE_COORDS.mutant_walk_1,
    SPRITE_COORDS.mutant_walk_2,
  ],
  [MonsterType.RAT]: [SPRITE_COORDS.rat_walk_1, SPRITE_COORDS.rat_walk_2],
  [MonsterType.SKULKER]: [SPRITE_COORDS.rat_walk_1, SPRITE_COORDS.rat_walk_2],
  [MonsterType.UTILITY_BOT]: [
    SPRITE_COORDS.utility_bot_walk_1,
    SPRITE_COORDS.utility_bot_walk_2,
  ],
  // New creatures use a single-frame "walk" (their idle sprite) for now.
  [MonsterType.GIANT_SPIDER]: [SPRITE_COORDS[MonsterType.GIANT_SPIDER]],
  [MonsterType.WILD_DOG]: [SPRITE_COORDS[MonsterType.WILD_DOG]],
  [MonsterType.ICKY_LUMP]: [SPRITE_COORDS[MonsterType.ICKY_LUMP]],
  [MonsterType.SNAGGLEPUSS]: [SPRITE_COORDS[MonsterType.SNAGGLEPUSS]],
  [MonsterType.FLUTTERBANG]: [SPRITE_COORDS[MonsterType.FLUTTERBANG]],
  [MonsterType.MOPPET]: [SPRITE_COORDS[MonsterType.MOPPET]],
  [MonsterType.CYBERCOP]: [SPRITE_COORDS[MonsterType.CYBERCOP]],
  [MonsterType.ZYTH]: [SPRITE_COORDS[MonsterType.ZYTH]],
  [MonsterType.TENTACULAR_HORROR]: [
    SPRITE_COORDS[MonsterType.TENTACULAR_HORROR],
  ],
  [MonsterType.TERRORIST_COLLABORATOR]: [
    SPRITE_COORDS[MonsterType.TERRORIST_COLLABORATOR],
  ],
  [MonsterType.DREADNAUGHT]: [SPRITE_COORDS[MonsterType.DREADNAUGHT]],
};

export const MONSTER_IDLE_FRAMES: Record<MonsterType, SpriteCoordinate> = {
  [MonsterType.MUTANT]: SPRITE_COORDS[MonsterType.MUTANT],
  [MonsterType.RAT]: SPRITE_COORDS[MonsterType.RAT],
  [MonsterType.SKULKER]: SPRITE_COORDS[MonsterType.RAT],
  [MonsterType.UTILITY_BOT]: SPRITE_COORDS[MonsterType.UTILITY_BOT],
  [MonsterType.GIANT_SPIDER]: SPRITE_COORDS[MonsterType.GIANT_SPIDER],
  [MonsterType.WILD_DOG]: SPRITE_COORDS[MonsterType.WILD_DOG],
  [MonsterType.ICKY_LUMP]: SPRITE_COORDS[MonsterType.ICKY_LUMP],
  [MonsterType.SNAGGLEPUSS]: SPRITE_COORDS[MonsterType.SNAGGLEPUSS],
  [MonsterType.FLUTTERBANG]: SPRITE_COORDS[MonsterType.FLUTTERBANG],
  [MonsterType.MOPPET]: SPRITE_COORDS[MonsterType.MOPPET],
  [MonsterType.CYBERCOP]: SPRITE_COORDS[MonsterType.CYBERCOP],
  [MonsterType.ZYTH]: SPRITE_COORDS[MonsterType.ZYTH],
  [MonsterType.TENTACULAR_HORROR]: SPRITE_COORDS[MonsterType.TENTACULAR_HORROR],
  [MonsterType.TERRORIST_COLLABORATOR]:
    SPRITE_COORDS[MonsterType.TERRORIST_COLLABORATOR],
  [MonsterType.DREADNAUGHT]: SPRITE_COORDS[MonsterType.DREADNAUGHT],
};
