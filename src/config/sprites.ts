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
  [TileType.DOOR_LOCKED]: { x: 4, y: 0 },
  [TileType.STAIRS]: { x: 5, y: 0 },

  // ========================================
  // Row 1 - Player
  // ========================================
  player: { x: 0, y: 1 },
  player_dead: { x: 1, y: 1 },

  // ========================================
  // Row 2 - Monsters/Entities
  // ========================================
  [MonsterType.MUTANT]: { x: 0, y: 2 },
  [MonsterType.RAT]: { x: 1, y: 2 },
  bullet: { x: 2, y: 2 },
  explosion_1: { x: 3, y: 2 },
  explosion_2: { x: 4, y: 2 },
  explosion_3: { x: 5, y: 2 },

  // ========================================
  // Row 3 - Items
  // ========================================
  [ItemType.PISTOL]: { x: 0, y: 3 },
  [ItemType.AMMO]: { x: 1, y: 3 },
  [ItemType.MEDKIT]: { x: 2, y: 3 },
  [ItemType.KEYCARD]: { x: 3, y: 3 },
  [ItemType.GRENADE]: { x: 4, y: 3 },
  [ItemType.LAND_MINE]: { x: 5, y: 3 },
};

export const EXPLOSION_FRAMES: SpriteCoordinate[] = [
  SPRITE_COORDS.explosion_1,
  SPRITE_COORDS.explosion_2,
  SPRITE_COORDS.explosion_3,
];
