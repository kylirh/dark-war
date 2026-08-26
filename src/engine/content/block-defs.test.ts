import { describe, it, expect } from "vitest";
import { TileType, ItemType } from "../types";
import {
  MINED_ITEM_FOR_TILE,
  PLACED_TILE_FOR_ITEM,
  minedItemForTile,
  placedTileForItem,
  isPlaceableItem,
} from "./block-defs";

describe("block-defs", () => {
  describe("MINED_ITEM_FOR_TILE", () => {
    it("maps minable tiles to their corresponding items", () => {
      // Just check a few specific mappings
      expect(MINED_ITEM_FOR_TILE[TileType.WALL]).toBe(ItemType.WALL_BLOCK);
      expect(MINED_ITEM_FOR_TILE[TileType.HOLOWALL]).toBe(ItemType.HOLOWALL);
      expect(MINED_ITEM_FOR_TILE[TileType.WATER_SHALLOW]).toBe(ItemType.WATER);
    });

    it("does not map terrain or unminable tiles", () => {
      // According to the comments, ground/terrain is not minable
      const unminableTiles = [
        TileType.FLOOR,
        TileType.STAIRS_DOWN,
        TileType.STAIRS_UP,
        TileType.HOLE,
        TileType.ASPHALT,
        TileType.SIDEWALK,
        TileType.GRASS,
        TileType.WEEDS,
        TileType.PARK_PATH,
      ];

      for (const tile of unminableTiles) {
        expect(MINED_ITEM_FOR_TILE[tile]).toBeUndefined();
      }
    });
  });

  describe("PLACED_TILE_FOR_ITEM", () => {
    it("maps placeable items to their corresponding tiles", () => {
      expect(PLACED_TILE_FOR_ITEM[ItemType.HOLOWALL]).toBe(TileType.HOLOWALL);
      expect(PLACED_TILE_FOR_ITEM[ItemType.WALL_BLOCK]).toBe(TileType.WALL);
      expect(PLACED_TILE_FOR_ITEM[ItemType.WATER]).toBe(TileType.WATER_SHALLOW);
    });

    it("does not map non-placeable items", () => {
      const nonPlaceableItems = [
        ItemType.PISTOL,
        ItemType.AMMO,
        ItemType.RUBBLE_CHUNK,
        ItemType.TRASH,
        ItemType.MATTER_MANIPULATOR,
      ];

      for (const item of nonPlaceableItems) {
        expect(PLACED_TILE_FOR_ITEM[item]).toBeUndefined();
      }
    });
  });

  describe("minedItemForTile", () => {
    it("returns the mapped item for a minable tile", () => {
      expect(minedItemForTile(TileType.WALL)).toBe(ItemType.WALL_BLOCK);
    });

    it("returns null for an unminable tile", () => {
      expect(minedItemForTile(TileType.FLOOR)).toBeNull();
    });
  });

  describe("placedTileForItem", () => {
    it("returns the mapped tile for a placeable item", () => {
      expect(placedTileForItem(ItemType.WALL_BLOCK)).toBe(TileType.WALL);
    });

    it("returns null for a non-placeable item", () => {
      expect(placedTileForItem(ItemType.PISTOL)).toBeNull();
    });
  });

  describe("isPlaceableItem", () => {
    it("returns true for placeable items", () => {
      expect(isPlaceableItem(ItemType.WALL_BLOCK)).toBe(true);
      expect(isPlaceableItem(ItemType.HOLOWALL)).toBe(true);
    });

    it("returns false for non-placeable items", () => {
      expect(isPlaceableItem(ItemType.PISTOL)).toBe(false);
      expect(isPlaceableItem(ItemType.AMMO)).toBe(false);
    });
  });
});
