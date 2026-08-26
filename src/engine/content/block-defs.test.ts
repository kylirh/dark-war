import { describe, it, expect } from "vitest";
import {
  PLACED_TILE_FOR_ITEM,
  MINED_ITEM_FOR_TILE,
  minedItemForTile,
  placedTileForItem,
  isPlaceableItem,
} from "./block-defs";
import { ItemType, TileType } from "../types";

describe("block-defs", () => {
  describe("minedItemForTile", () => {
    it("returns the correct item for minable tiles", () => {
      expect(minedItemForTile(TileType.WALL)).toBe(ItemType.WALL_BLOCK);
      expect(minedItemForTile(TileType.DOOR_CLOSED)).toBe(ItemType.DOOR);
      expect(minedItemForTile(TileType.TREE)).toBe(ItemType.TREE_ITEM);
    });

    it("returns null for unminable tiles", () => {
      expect(minedItemForTile(TileType.FLOOR)).toBeNull();
      expect(minedItemForTile(TileType.ASPHALT)).toBeNull();
      expect(minedItemForTile(TileType.GRASS)).toBeNull();
    });
  });

  describe("placedTileForItem", () => {
    it("returns the correct tile for placeable items", () => {
      expect(placedTileForItem(ItemType.WALL_BLOCK)).toBe(TileType.WALL);
      expect(placedTileForItem(ItemType.DOOR)).toBe(TileType.DOOR_CLOSED);
      expect(placedTileForItem(ItemType.HOLOWALL)).toBe(TileType.HOLOWALL);
    });

    it("returns null for unplaceable items", () => {
      expect(placedTileForItem(ItemType.PISTOL)).toBeNull();
      expect(placedTileForItem(ItemType.MEDKIT)).toBeNull();
      expect(placedTileForItem(ItemType.KEYCARD)).toBeNull();
    });
  });

  describe("isPlaceableItem", () => {
    it("returns true for placeable items", () => {
      expect(isPlaceableItem(ItemType.WALL_BLOCK)).toBe(true);
      expect(isPlaceableItem(ItemType.DOOR)).toBe(true);
      expect(isPlaceableItem(ItemType.HOLOWALL)).toBe(true);
    });

    it("returns false for unplaceable items", () => {
      expect(isPlaceableItem(ItemType.PISTOL)).toBe(false);
      expect(isPlaceableItem(ItemType.RUBBLE_CHUNK)).toBe(false); // Can be mined, but not placed
    });

    it("handles edge cases and built-in properties safely", () => {
      // The implementation uses Object.prototype.hasOwnProperty.call(PLACED_TILE_FOR_ITEM, item)
      // This protects against built-in property names. Let's verify that.
      expect(isPlaceableItem("toString" as ItemType)).toBe(false);
      expect(isPlaceableItem("__proto__" as ItemType)).toBe(false);
      expect(isPlaceableItem("constructor" as ItemType)).toBe(false);
      expect(isPlaceableItem("valueOf" as ItemType)).toBe(false);
    });
  });

  describe("Symmetry and completeness", () => {
    it("all placed items can be mined back", () => {
      for (const [itemStr, tileStr] of Object.entries(PLACED_TILE_FOR_ITEM)) {
        const item = itemStr as ItemType;
        const tile = tileStr as TileType;

        // Some mappings aren't perfectly symmetric by design
        // E.g. DOOR_CLOSED, DOOR_OPEN, DOOR_LOCKED all drop DOOR.
        // DOOR places DOOR_CLOSED.
        // WATER_SHALLOW, WATER_DEEP, WATER_RIVER all drop WATER.
        // WATER places WATER_SHALLOW.

        const minedItem = minedItemForTile(tile);
        expect(minedItem).toBe(item);
      }
    });

    it("all explicitly mapped mined items are supported placeable items except rubble", () => {
      for (const [tileStr, itemStr] of Object.entries(MINED_ITEM_FOR_TILE)) {
        const item = itemStr as ItemType;

        // Rubble can be mined but not placed
        if (item === ItemType.RUBBLE_CHUNK) {
          continue;
        }

        expect(isPlaceableItem(item)).toBe(true);
      }
    });
  });
});
