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
 * Layout: 512×128 (16×4 tiles at 32×32)
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
  [TileType.FLOOR]: { x: 1, y: 0 },
  [TileType.DOOR_CLOSED]: { x: 2, y: 0 },
  [TileType.DOOR_OPEN]: { x: 3, y: 0 },
  [TileType.DOOR_LOCKED]: { x: 2, y: 0 }, // Same sprite as closed door
  [TileType.STAIRS]: { x: 5, y: 0 },
  wall_damaged_1: { x: 6, y: 0 },
  wall_damaged_2: { x: 7, y: 0 },

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
  land_mine_active: { x: 6, y: 3 },
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
};

export const MONSTER_IDLE_FRAMES: Record<MonsterType, SpriteCoordinate> = {
  [MonsterType.MUTANT]: SPRITE_COORDS[MonsterType.MUTANT],
  [MonsterType.RAT]: SPRITE_COORDS[MonsterType.RAT],
};
