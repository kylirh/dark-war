import { describe, it, expect, beforeEach } from "vitest";
import { TileType, OUTSIDE_MAP_WIDTH, OUTSIDE_MAP_HEIGHT } from "../types";
import { RNG } from "../utils/rng";
import { createOutsideLevel } from "./outside-level";
import { passableFor, tileAtFor } from "../utils/helpers";

describe("createOutsideLevel", () => {
  beforeEach(() => RNG.reseed(123));

  it("produces a full-size exterior map", () => {
    const lvl = createOutsideLevel();
    expect(lvl.width).toBe(OUTSIDE_MAP_WIDTH);
    expect(lvl.height).toBe(OUTSIDE_MAP_HEIGHT);
    expect(lvl.map).toHaveLength(OUTSIDE_MAP_WIDTH * OUTSIDE_MAP_HEIGHT);
  });

  it("spawns the player start on a passable tile", () => {
    const lvl = createOutsideLevel();
    expect(
      passableFor(lvl.map, lvl.start[0], lvl.start[1], lvl.width, lvl.height),
    ).toBe(true);
  });

  it("places the facility entrance (down-stairs) tile", () => {
    const lvl = createOutsideLevel();
    expect(
      tileAtFor(lvl.map, lvl.stairsDown[0], lvl.stairsDown[1], lvl.width, lvl.height),
    ).toBe(TileType.STAIRS_DOWN);
  });

  it("is deterministic for a fixed seed", () => {
    RNG.reseed(7);
    const a = createOutsideLevel();
    RNG.reseed(7);
    const b = createOutsideLevel();
    expect(a.map).toEqual(b.map);
  });
});
