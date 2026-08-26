/**
 * Coverage for the item-definition lookups.
 *
 * `itemName` and `isJunk` are thin reads over `ITEM_DEFS`, so the tests focus
 * on the two things that can actually break: the lookups agreeing with the
 * table, and the fallback branches holding when a type is missing from it
 * (which is reachable via deserialization and unchecked casts).
 */

import { describe, it, expect } from "vitest";
import { ITEM_DEFS, itemName, isJunk } from "./item-defs";
import { ItemType } from "../types";

describe("item-defs", () => {
  describe("ITEM_DEFS", () => {
    it("defines a name and category for every ItemType", () => {
      for (const type of Object.values(ItemType)) {
        const def = ITEM_DEFS[type];
        expect(def, `${type} has no definition`).toBeDefined();
        expect(def?.name.length, `${type} has an empty name`).toBeGreaterThan(
          0,
        );
        expect(def?.category, `${type} has no category`).toBeTruthy();
      }
    });
  });

  describe("itemName", () => {
    it("returns the configured display name", () => {
      expect(itemName(ItemType.PISTOL)).toBe("Gyrojet Pistol");
      expect(itemName(ItemType.TRASH)).toBe("Trash");
    });

    it("agrees with the table for every defined item", () => {
      for (const type of Object.values(ItemType)) {
        expect(itemName(type)).toBe(ITEM_DEFS[type]?.name);
      }
    });

    it("falls back to the raw type when no definition exists", () => {
      // Reachable through deserialization of an unknown item or an unchecked
      // cast; the name must degrade to the identifier rather than throw.
      expect(itemName("not-a-real-item" as ItemType)).toBe("not-a-real-item");
    });
  });

  describe("isJunk", () => {
    it("returns true for items the utility bot cleans up", () => {
      expect(isJunk(ItemType.TRASH)).toBe(true);
    });

    it("returns false for items worth keeping", () => {
      expect(isJunk(ItemType.PISTOL)).toBe(false);
      expect(isJunk(ItemType.MEDKIT)).toBe(false);
    });

    it("agrees with the cleanedByBot flag for every defined item", () => {
      for (const type of Object.values(ItemType)) {
        expect(isJunk(type)).toBe(ITEM_DEFS[type]?.cleanedByBot === true);
      }
    });

    it("returns false when no definition exists", () => {
      expect(isJunk("not-a-real-item" as ItemType)).toBe(false);
    });
  });
});
