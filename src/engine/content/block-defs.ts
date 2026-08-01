import { ItemType, TileType } from "../types";

/**
 * The Matter Manipulator's two lookup tables.
 *
 * Mining: any supported fixture or structure (including a holowall) breaks
 * into a matching item dropped on the ground. Ground/terrain (floor, grass,
 * roads, stairs, and holes) is not minable.
 *
 * Placing: any placeable item becomes its tile. Holowalls place an
 * indestructible tile; rubble/scrap have no placement and stay inert junk.
 */
export const MINED_ITEM_FOR_TILE: Partial<Record<TileType, ItemType>> = {
  [TileType.WALL]: ItemType.WALL_BLOCK,
  [TileType.HOLOWALL]: ItemType.HOLOWALL,
  [TileType.BUILDING]: ItemType.BUILDING_BLOCK,
  [TileType.FENCE]: ItemType.FENCE_BLOCK,
  [TileType.DOOR_CLOSED]: ItemType.DOOR,
  [TileType.DOOR_OPEN]: ItemType.DOOR,
  [TileType.DOOR_LOCKED]: ItemType.DOOR,
  [TileType.TREE]: ItemType.TREE_ITEM,
  [TileType.RUBBLE]: ItemType.RUBBLE_CHUNK,
  [TileType.LIGHT]: ItemType.LIGHT_FIXTURE,
  [TileType.WATER_SHALLOW]: ItemType.WATER,
  [TileType.WATER_DEEP]: ItemType.WATER,
  [TileType.WATER_RIVER]: ItemType.WATER,
};

export const PLACED_TILE_FOR_ITEM: Partial<Record<ItemType, TileType>> = {
  [ItemType.HOLOWALL]: TileType.HOLOWALL,
  [ItemType.WALL_BLOCK]: TileType.WALL,
  [ItemType.BUILDING_BLOCK]: TileType.BUILDING,
  [ItemType.FENCE_BLOCK]: TileType.FENCE,
  [ItemType.DOOR]: TileType.DOOR_CLOSED,
  [ItemType.TREE_ITEM]: TileType.TREE,
  [ItemType.LIGHT_FIXTURE]: TileType.LIGHT,
  [ItemType.WATER]: TileType.WATER_SHALLOW,
};

/** The item a fixture tile drops when mined, or null if it can't be mined. */
export function minedItemForTile(tile: TileType): ItemType | null {
  return MINED_ITEM_FOR_TILE[tile] ?? null;
}

/** The tile a placeable item becomes when placed, or null if not placeable. */
export function placedTileForItem(item: ItemType): TileType | null {
  return PLACED_TILE_FOR_ITEM[item] ?? null;
}

/** Whether the Matter Manipulator can place this item. */
export function isPlaceableItem(item: ItemType): boolean {
  return Object.prototype.hasOwnProperty.call(PLACED_TILE_FOR_ITEM, item);
}
