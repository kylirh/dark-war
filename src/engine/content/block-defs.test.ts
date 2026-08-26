/**
 * Structural validation for the Matter Manipulator's mine/place lookup tables.
 *
 * These two tables are the whole contract for terrain editing, so the tests
 * cover both directions, the round-trip between them, and the deliberate
 * asymmetries (many tile variants collapsing onto one item, rubble being
 * minable but not placeable).
 */

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
      expect(minedItemForTile(TileType.HOLOWALL)).toBe(ItemType.HOLOWALL);
      expect(minedItemForTile(TileType.WATER_SHALLOW)).toBe(ItemType.WATER);
    });

    it("returns null for ground and terrain, which is not minable", () => {
      const unminable = [
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

      for (const tile of unminable) {
        expect(
          minedItemForTile(tile),
          `${tile} should not be minable`,
        ).toBeNull();
      }
    });

    it("collapses every variant of a fixture onto one item", () => {
      // Doors and water have several tile states but a single carryable item.
      expect(minedItemForTile(TileType.DOOR_OPEN)).toBe(ItemType.DOOR);
      expect(minedItemForTile(TileType.DOOR_LOCKED)).toBe(ItemType.DOOR);
      expect(minedItemForTile(TileType.WATER_DEEP)).toBe(ItemType.WATER);
      expect(minedItemForTile(TileType.WATER_RIVER)).toBe(ItemType.WATER);
    });
  });

  describe("placedTileForItem", () => {
    it("returns the correct tile for placeable items", () => {
      expect(placedTileForItem(ItemType.WALL_BLOCK)).toBe(TileType.WALL);
      expect(placedTileForItem(ItemType.DOOR)).toBe(TileType.DOOR_CLOSED);
      expect(placedTileForItem(ItemType.HOLOWALL)).toBe(TileType.HOLOWALL);
      expect(placedTileForItem(ItemType.WATER)).toBe(TileType.WATER_SHALLOW);
    });

    it("returns null for unplaceable items", () => {
      const unplaceable = [
        ItemType.PISTOL,
        ItemType.AMMO,
        ItemType.MEDKIT,
        ItemType.KEYCARD,
        ItemType.RUBBLE_CHUNK,
        ItemType.TRASH,
        ItemType.MATTER_MANIPULATOR,
      ];

      for (const item of unplaceable) {
        expect(
          placedTileForItem(item),
          `${item} should not be placeable`,
        ).toBeNull();
      }
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
      expect(isPlaceableItem(ItemType.AMMO)).toBe(false);
      // Rubble can be mined out of a wall, but never placed back.
      expect(isPlaceableItem(ItemType.RUBBLE_CHUNK)).toBe(false);
    });

    it("does not report inherited Object.prototype keys as placeable", () => {
      // The implementation uses hasOwnProperty rather than a truthiness check
      // on the lookup, so prototype keys must not leak through.
      expect(isPlaceableItem("toString" as ItemType)).toBe(false);
      expect(isPlaceableItem("__proto__" as ItemType)).toBe(false);
      expect(isPlaceableItem("constructor" as ItemType)).toBe(false);
      expect(isPlaceableItem("valueOf" as ItemType)).toBe(false);
    });
  });

  describe("round trip", () => {
    it("mines every placed tile back into the item that placed it", () => {
      // Placing is one-to-one, so place-then-mine must return the same item
      // even where mining is many-to-one (DOOR_OPEN and DOOR_LOCKED also drop
      // a DOOR; WATER_DEEP and WATER_RIVER also drop WATER).
      for (const [itemKey, tile] of Object.entries(PLACED_TILE_FOR_ITEM)) {
        const item = itemKey as ItemType;
        expect(
          minedItemForTile(tile as TileType),
          `placing ${item} yields ${tile}, which does not mine back to ${item}`,
        ).toBe(item);
      }
    });

    it("keeps every minable drop placeable, except inert rubble", () => {
      for (const itemValue of Object.values(MINED_ITEM_FOR_TILE)) {
        const item = itemValue as ItemType;
        if (item === ItemType.RUBBLE_CHUNK) continue;
        expect(
          isPlaceableItem(item),
          `${item} can be mined but not placed`,
        ).toBe(true);
      }
    });
  });
});
