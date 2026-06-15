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

export type SpriteShadowSize = "none" | "small" | "medium" | "large" | "huge";

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  renderWidth: number;
  renderHeight: number;
  anchorX: number;
  anchorY: number;
  yOffset: number;
  depthOffset: number;
  shadow: SpriteShadowSize;
}

export type FacingDirection = "down" | "up" | "left" | "right";

// Sprite sheet configuration
export const SPRITE_SHEET_PATH = "assets/img/sprites.png";
export const SPRITE_SIZE = 32;
export const SPRITES_PER_ROW = 16;

const WALL_AUTOTILE_BASE_ROWS: Record<string, number> = {
  [TileType.WALL]: 18,
  wall_damaged_1: 22,
  wall_damaged_2: 26,
  wall_wood: 30,
  wall_wood_damaged_1: 34,
  wall_wood_damaged_2: 38,
};

const HOLE_AUTOTILE_ROW = 42;

/**
 * Resolve one of the 16 cardinal-neighbor wall variants.
 */
export function wallAutotileCoordinate(
  wallKey: string | number,
  mask: number,
): SpriteCoordinate {
  const baseRow = WALL_AUTOTILE_BASE_ROWS[String(wallKey)];
  if (baseRow === undefined) {
    return SPRITE_COORDS[wallKey];
  }
  const normalizedMask = mask & 15;
  return {
    x: normalizedMask % 8,
    y: baseRow + Math.floor(normalizedMask / 8) * 2,
  };
}

/**
 * Resolve one of the 16 cardinal-neighbor hole variants.
 */
export function holeAutotileCoordinate(mask: number): SpriteCoordinate {
  return { x: mask & 15, y: HOLE_AUTOTILE_ROW };
}

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
  [TileType.WALL]: { x: 0, y: 8 },
  wall_wood: { x: 1, y: 8 },
  [TileType.FLOOR]: { x: 1, y: 0 },
  [TileType.DOOR_CLOSED]: { x: 6, y: 8 },
  [TileType.DOOR_OPEN]: { x: 7, y: 8 },
  [TileType.DOOR_LOCKED]: { x: 8, y: 8 },
  [TileType.HOLE]: { x: 14, y: 0 },
  [TileType.STAIRS_UP]: { x: 4, y: 0 },
  [TileType.STAIRS_DOWN]: { x: 5, y: 0 },
  wall_damaged_1: { x: 2, y: 8 },
  wall_damaged_2: { x: 3, y: 8 },
  wall_wood_damaged_1: { x: 4, y: 8 },
  wall_wood_damaged_2: { x: 5, y: 8 },
  floor_damaged: { x: 13, y: 0 },
  hole: { x: 14, y: 0 },
  [TileType.ASPHALT]: { x: 0, y: 4 },
  asphalt_cracked: { x: 9, y: 9 },
  [TileType.SIDEWALK]: { x: 1, y: 4 },
  sidewalk_cracked: { x: 10, y: 9 },
  [TileType.GRASS]: { x: 2, y: 4 },
  grass_flowers: { x: 11, y: 9 },
  grass_blades: { x: 9, y: 8 },
  [TileType.WEEDS]: { x: 3, y: 4 },
  weeds_dense: { x: 12, y: 9 },
  weeds_blades: { x: 10, y: 8 },
  [TileType.PARK_PATH]: { x: 4, y: 4 },
  [TileType.TREE]: { x: 0, y: 10 },
  [TileType.BUILDING]: { x: 2, y: 10 },
  building_roof: { x: 5, y: 10 },
  [TileType.FENCE]: { x: 3, y: 10 },
  fence_horizontal: { x: 6, y: 10 },
  fence_vertical: { x: 7, y: 10 },
  [TileType.RUBBLE]: { x: 8, y: 4 },
  megacorp_entrance: { x: 4, y: 10 },
  streetlight: { x: 8, y: 10 },
  terminal: { x: 9, y: 10 },
  crate: { x: 10, y: 10 },
  barrel: { x: 11, y: 10 },
  blood_stain: { x: 15, y: 9 },

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
  giant_spider_walk_1: { x: 0, y: 16 },
  giant_spider_walk_2: { x: 1, y: 16 },
  [MonsterType.WILD_DOG]: { x: 1, y: 7 },
  wild_dog_walk_1: { x: 2, y: 16 },
  wild_dog_walk_2: { x: 3, y: 16 },
  [MonsterType.ICKY_LUMP]: { x: 2, y: 7 },
  icky_lump_walk_1: { x: 4, y: 16 },
  icky_lump_walk_2: { x: 5, y: 16 },
  [MonsterType.SNAGGLEPUSS]: { x: 3, y: 7 },
  snagglepuss_walk_1: { x: 6, y: 16 },
  snagglepuss_walk_2: { x: 7, y: 16 },
  [MonsterType.FLUTTERBANG]: { x: 4, y: 7 },
  flutterbang_walk_1: { x: 8, y: 16 },
  flutterbang_walk_2: { x: 9, y: 16 },
  [MonsterType.MOPPET]: { x: 5, y: 7 },
  moppet_walk_1: { x: 10, y: 16 },
  moppet_walk_2: { x: 11, y: 16 },
  [MonsterType.CYBERCOP]: { x: 6, y: 7 },
  cybercop_walk_1: { x: 12, y: 16 },
  cybercop_walk_2: { x: 13, y: 16 },
  [MonsterType.ZYTH]: { x: 7, y: 7 },
  zyth_walk_1: { x: 14, y: 16 },
  zyth_walk_2: { x: 15, y: 16 },
  [MonsterType.TENTACULAR_HORROR]: { x: 8, y: 12 },
  tentacular_horror_walk_1: { x: 8, y: 12 },
  tentacular_horror_walk_2: { x: 0, y: 14 },
  [MonsterType.TERRORIST_COLLABORATOR]: { x: 9, y: 7 },
  terrorist_collaborator_walk_1: { x: 9, y: 7 },
  terrorist_collaborator_walk_2: { x: 4, y: 14 },
  [MonsterType.DREADNAUGHT]: { x: 10, y: 12 },
  dreadnaught_walk_1: { x: 10, y: 12 },
  dreadnaught_walk_2: { x: 2, y: 14 },
};

const singleCellBillboard = {
  width: 1,
  height: 1,
  renderWidth: 32,
  renderHeight: 32,
  anchorX: 0.5,
  anchorY: 1,
  yOffset: 0,
  depthOffset: 0,
};

const flatSprite = {
  width: 1,
  height: 1,
  renderWidth: 32,
  renderHeight: 32,
  anchorX: 0,
  anchorY: 0,
  yOffset: 0,
  depthOffset: 0,
  shadow: "none" as const,
};

export const SPRITE_FRAMES: Record<string, Partial<SpriteFrame>> = {
  [TileType.FLOOR]: flatSprite,
  [TileType.HOLE]: flatSprite,
  [TileType.ASPHALT]: flatSprite,
  [TileType.SIDEWALK]: flatSprite,
  [TileType.GRASS]: flatSprite,
  [TileType.WEEDS]: flatSprite,
  [TileType.PARK_PATH]: flatSprite,
  asphalt_cracked: flatSprite,
  sidewalk_cracked: flatSprite,
  grass_flowers: flatSprite,
  weeds_dense: flatSprite,
  floor_damaged: flatSprite,
  hole: flatSprite,

  [TileType.WALL]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  wall_wood: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  wall_damaged_1: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  wall_damaged_2: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  wall_wood_damaged_1: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  wall_wood_damaged_2: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  grass_blades: {
    ...singleCellBillboard,
    renderHeight: 24,
    depthOffset: -3,
    shadow: "none",
  },
  weeds_blades: {
    ...singleCellBillboard,
    renderHeight: 28,
    depthOffset: -3,
    shadow: "none",
  },
  [TileType.TREE]: {
    ...singleCellBillboard,
    width: 2,
    height: 3,
    renderWidth: 64,
    renderHeight: 96,
    depthOffset: 2,
    shadow: "large",
  },
  [TileType.BUILDING]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  building_roof: flatSprite,
  [TileType.FENCE]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  fence_horizontal: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  fence_vertical: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  [TileType.RUBBLE]: {
    ...singleCellBillboard,
    renderHeight: 28,
    shadow: "small",
  },
  [TileType.DOOR_CLOSED]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  [TileType.DOOR_OPEN]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  [TileType.DOOR_LOCKED]: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  [TileType.STAIRS_DOWN]: flatSprite,
  [TileType.STAIRS_UP]: flatSprite,
  megacorp_entrance: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "medium",
  },
  streetlight: {
    ...singleCellBillboard,
    height: 2,
    renderHeight: 64,
    shadow: "small",
  },
  terminal: {
    ...singleCellBillboard,
    renderHeight: 36,
    shadow: "small",
  },
  crate: {
    ...singleCellBillboard,
    renderHeight: 28,
    shadow: "small",
  },
  barrel: {
    ...singleCellBillboard,
    renderHeight: 30,
    shadow: "small",
  },
  blood_stain: flatSprite,

  player: { ...singleCellBillboard, renderHeight: 40, shadow: "small" },
  player_dead: { ...singleCellBillboard, shadow: "small" },
  player_walk_down_1: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  player_walk_down_2: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  player_walk_side_1: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  player_walk_side_2: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  player_walk_up_1: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  player_walk_up_2: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
  bullet: {
    width: 1,
    height: 1,
    renderWidth: 32,
    renderHeight: 32,
    anchorX: 0.5,
    anchorY: 0.5,
    yOffset: 0,
    depthOffset: 0,
    shadow: "none",
  },
  laser_bullet: {
    width: 1,
    height: 1,
    renderWidth: 32,
    renderHeight: 32,
    anchorX: 0.5,
    anchorY: 0.5,
    yOffset: 0,
    depthOffset: 0,
    shadow: "none",
  },
  explosion_1: {
    width: 1,
    height: 1,
    renderWidth: 48,
    renderHeight: 48,
    anchorX: 0.5,
    anchorY: 0.5,
    yOffset: 0,
    depthOffset: 20,
    shadow: "none",
  },
  explosion_2: {
    width: 1,
    height: 1,
    renderWidth: 56,
    renderHeight: 56,
    anchorX: 0.5,
    anchorY: 0.5,
    yOffset: 0,
    depthOffset: 20,
    shadow: "none",
  },
  explosion_3: {
    width: 1,
    height: 1,
    renderWidth: 64,
    renderHeight: 64,
    anchorX: 0.5,
    anchorY: 0.5,
    yOffset: 0,
    depthOffset: 20,
    shadow: "none",
  },

  [MonsterType.TENTACULAR_HORROR]: {
    ...singleCellBillboard,
    width: 2,
    height: 2,
    renderWidth: 64,
    renderHeight: 64,
    shadow: "huge",
  },
  [MonsterType.DREADNAUGHT]: {
    ...singleCellBillboard,
    width: 2,
    height: 2,
    renderWidth: 64,
    renderHeight: 64,
    shadow: "huge",
  },
  tentacular_horror_walk: {
    ...singleCellBillboard,
    width: 2,
    height: 2,
    renderWidth: 64,
    renderHeight: 64,
    shadow: "huge",
  },
  dreadnaught_walk: {
    ...singleCellBillboard,
    width: 2,
    height: 2,
    renderWidth: 64,
    renderHeight: 64,
    shadow: "huge",
  },
  [MonsterType.CYBERCOP]: {
    ...singleCellBillboard,
    renderHeight: 40,
    shadow: "small",
  },
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
  [MonsterType.GIANT_SPIDER]: [
    SPRITE_COORDS.giant_spider_walk_1,
    SPRITE_COORDS.giant_spider_walk_2,
  ],
  [MonsterType.WILD_DOG]: [
    SPRITE_COORDS.wild_dog_walk_1,
    SPRITE_COORDS.wild_dog_walk_2,
  ],
  [MonsterType.ICKY_LUMP]: [
    SPRITE_COORDS.icky_lump_walk_1,
    SPRITE_COORDS.icky_lump_walk_2,
  ],
  [MonsterType.SNAGGLEPUSS]: [
    SPRITE_COORDS.snagglepuss_walk_1,
    SPRITE_COORDS.snagglepuss_walk_2,
  ],
  [MonsterType.FLUTTERBANG]: [
    SPRITE_COORDS.flutterbang_walk_1,
    SPRITE_COORDS.flutterbang_walk_2,
  ],
  [MonsterType.MOPPET]: [
    SPRITE_COORDS.moppet_walk_1,
    SPRITE_COORDS.moppet_walk_2,
  ],
  [MonsterType.CYBERCOP]: [
    SPRITE_COORDS.cybercop_walk_1,
    SPRITE_COORDS.cybercop_walk_2,
  ],
  [MonsterType.ZYTH]: [SPRITE_COORDS.zyth_walk_1, SPRITE_COORDS.zyth_walk_2],
  [MonsterType.TENTACULAR_HORROR]: [
    SPRITE_COORDS.tentacular_horror_walk_1,
    SPRITE_COORDS.tentacular_horror_walk_2,
  ],
  [MonsterType.TERRORIST_COLLABORATOR]: [
    SPRITE_COORDS.terrorist_collaborator_walk_1,
    SPRITE_COORDS.terrorist_collaborator_walk_2,
  ],
  [MonsterType.DREADNAUGHT]: [
    SPRITE_COORDS.dreadnaught_walk_1,
    SPRITE_COORDS.dreadnaught_walk_2,
  ],
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
