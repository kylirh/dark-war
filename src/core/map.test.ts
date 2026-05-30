import { describe, it, expect, beforeEach } from "vitest";
import { TileType, MAP_WIDTH, MAP_HEIGHT } from "../types";
import { RNG } from "../utils/rng";
import { generateDungeon } from "./map";
import { tileAtFor, passableFor } from "../utils/helpers";

describe("generateDungeon", () => {
  beforeEach(() => RNG.reseed(20260529));

  it("produces a full-size map with the expected dimensions", () => {
    const d = generateDungeon();
    expect(d.width).toBe(MAP_WIDTH);
    expect(d.height).toBe(MAP_HEIGHT);
    expect(d.map).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
  });

  it("seals the outer border with walls", () => {
    const d = generateDungeon();
    for (let x = 0; x < MAP_WIDTH; x++) {
      expect(tileAtFor(d.map, x, 0, MAP_WIDTH, MAP_HEIGHT)).toBe(TileType.WALL);
      expect(tileAtFor(d.map, x, MAP_HEIGHT - 1, MAP_WIDTH, MAP_HEIGHT)).toBe(TileType.WALL);
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      expect(tileAtFor(d.map, 0, y, MAP_WIDTH, MAP_HEIGHT)).toBe(TileType.WALL);
      expect(tileAtFor(d.map, MAP_WIDTH - 1, y, MAP_WIDTH, MAP_HEIGHT)).toBe(TileType.WALL);
    }
  });

  it("places the start on a passable tile and stairs down as a stairs tile", () => {
    const d = generateDungeon();
    expect(passableFor(d.map, d.start[0], d.start[1], MAP_WIDTH, MAP_HEIGHT)).toBe(true);
    expect(tileAtFor(d.map, d.stairsDown[0], d.stairsDown[1], MAP_WIDTH, MAP_HEIGHT)).toBe(
      TileType.STAIRS_DOWN,
    );
  });

  it("carves at least one room and some floor", () => {
    const d = generateDungeon();
    expect(d.rooms.length).toBeGreaterThan(0);
    const floorCount = d.map.filter((t) => t === TileType.FLOOR).length;
    expect(floorCount).toBeGreaterThan(50);
  });

  it("is deterministic for a fixed seed", () => {
    RNG.reseed(123);
    const a = generateDungeon();
    RNG.reseed(123);
    const b = generateDungeon();
    expect(a.map).toEqual(b.map);
    expect(a.start).toEqual(b.start);
    expect(a.stairsDown).toEqual(b.stairsDown);
  });
});
