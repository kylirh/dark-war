import { describe, expect, it, beforeEach } from "vitest";
import { TileType } from "../types";
import { passableFor } from "../utils/helpers";
import { RNG } from "../utils/rng";
import { generateDungeon } from "./map";

describe("generateDungeon", () => {
  beforeEach(() => RNG.reseed(2026));

  it("materializes the active chunk generator with doors and stairs", () => {
    const dungeon = generateDungeon();
    const doorCount = dungeon.map.filter(
      (tile) =>
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_LOCKED ||
        tile === TileType.DOOR_OPEN,
    ).length;

    expect(dungeon.map).toHaveLength(dungeon.width * dungeon.height);
    expect(passableFor(dungeon.map, dungeon.start[0], dungeon.start[1], dungeon.width, dungeon.height)).toBe(true);
    expect(dungeon.map[dungeon.stairsDown[0] + dungeon.stairsDown[1] * dungeon.width]).toBe(TileType.STAIRS_DOWN);
    expect(doorCount).toBeGreaterThan(0);
  });
});