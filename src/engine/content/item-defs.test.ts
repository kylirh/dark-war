import { describe, it, expect } from "vitest";
import { itemName, isJunk } from "./item-defs";
import { ItemType } from "../types";

describe("item-defs", () => {
  describe("itemName", () => {
    it("returns the configured name for a known item type", () => {
      expect(itemName(ItemType.PISTOL)).toBe("Gyrojet Pistol");
    });
  });

  describe("isJunk", () => {
    it("returns true for junk items", () => {
      expect(isJunk(ItemType.TRASH)).toBe(true);
    });

    it("returns false for non-junk items", () => {
      expect(isJunk(ItemType.PISTOL)).toBe(false);
    });
  });
});
