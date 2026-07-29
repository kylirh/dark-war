import { describe, it, expect, beforeEach } from "vitest";
import { TileType, OUTSIDE_MAP_WIDTH, OUTSIDE_MAP_HEIGHT } from "../types";
import { RNG } from "../utils/rng";
import { createOutsideLevel } from "./outside-level";
import { GroundType, StructureType } from "./world-semantics";

describe("createOutsideLevel", () => {
  beforeEach(() => RNG.reseed(123));

  it("produces a full-size exterior map", () => {
    const lvl = createOutsideLevel();
    expect(lvl.width).toBe(OUTSIDE_MAP_WIDTH);
    expect(lvl.height).toBe(OUTSIDE_MAP_HEIGHT);
    expect(lvl.worldPlane.width).toBe(lvl.width);
    expect(lvl.worldPlane.layers.ground).toHaveLength(
      OUTSIDE_MAP_WIDTH * OUTSIDE_MAP_HEIGHT,
    );
  });

  it("spawns the player start on a passable tile", () => {
    const lvl = createOutsideLevel();
    expect(lvl.worldPlane.passable(lvl.start[0], lvl.start[1])).toBe(true);
  });

  it("places the facility entrance (down-stairs) tile", () => {
    const lvl = createOutsideLevel();
    expect(lvl.worldPlane.getTile(lvl.stairsDown[0], lvl.stairsDown[1])).toBe(
      TileType.STAIRS_DOWN,
    );
  });

  it("is deterministic for a fixed seed", () => {
    RNG.reseed(7);
    const a = createOutsideLevel();
    RNG.reseed(7);
    const b = createOutsideLevel();
    expect(a.worldPlane.layers).toEqual(b.worldPlane.layers);
  });

  it("contains production terraces, static water, and a traversable bridge", () => {
    const level = createOutsideLevel();
    const elevations = [...level.worldPlane.layers.elevation];
    expect(Math.min(...elevations)).toBeLessThan(0);
    expect(Math.max(...elevations)).toBeGreaterThanOrEqual(3);

    const waterIndex = level.worldPlane.layers.ground.findIndex(
      (ground) => ground === GroundType.WATER_DEEP,
    );
    expect(waterIndex).toBeGreaterThanOrEqual(0);
    expect(
      level.worldPlane.passable(
        waterIndex % level.width,
        Math.floor(waterIndex / level.width),
      ),
    ).toBe(false);

    const bridgeIndex = level.worldPlane.layers.structure.findIndex(
      (structure) => structure === StructureType.BRIDGE_HORIZONTAL,
    );
    expect(bridgeIndex).toBeGreaterThanOrEqual(0);
    expect(
      level.worldPlane.passable(
        bridgeIndex % level.width,
        Math.floor(bridgeIndex / level.width),
      ),
    ).toBe(true);
  });

  it("composes the Tiled-authored rebuilding vignette", () => {
    const level = createOutsideLevel();
    expect(
      level.worldPlane.layers.structure.includes(StructureType.WORKSHOP),
    ).toBe(true);
    expect(
      level.worldPlane.layers.structure.includes(
        StructureType.WORKSHOP_FOOTPRINT,
      ),
    ).toBe(true);
  });
});
