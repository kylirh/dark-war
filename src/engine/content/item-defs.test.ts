import { describe, it, expect } from "vitest";
import { itemName, isJunk } from "./item-defs";
import { ItemType } from "../types";

describe("item-defs", () => {
  describe("itemName", () => {
    it("should return the correct name for a given item type", () => {
      expect(itemName(ItemType.PISTOL)).toBe("Gyrojet Pistol");
    });

    it("should return the correct name for another item type", () => {
      expect(itemName(ItemType.TRASH)).toBe("Trash");
    });
  });

  describe("isJunk", () => {
    it("should return true for items that are considered junk", () => {
      expect(isJunk(ItemType.TRASH)).toBe(true);
    });

    it("should return false for items that are not considered junk", () => {
      expect(isJunk(ItemType.PISTOL)).toBe(false);
    });
  });
});
