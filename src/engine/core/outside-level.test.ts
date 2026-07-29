import { describe, it, expect, beforeEach } from "vitest";
import { TileType, OUTSIDE_MAP_WIDTH, OUTSIDE_MAP_HEIGHT } from "../types";
import { RNG } from "../utils/rng";
import {
  createOutsideLevel,
  OUTSIDE_CAVE_MOUTH,
  PARK_WORKSHOP_DOOR,
} from "./outside-level";
import { FixtureType, GroundType, StructureType } from "./world-semantics";
import { WorldPlane } from "./world-plane";

function reachable(
  plane: WorldPlane,
  start: readonly [number, number],
  goal: readonly [number, number],
): boolean {
  const queue: Array<readonly [number, number]> = [start];
  const visited = new Set([plane.indexFor(start[0], start[1])]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [x, y] = queue[cursor];
    if (x === goal[0] && y === goal[1]) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (!plane.inBounds(nextX, nextY)) continue;
      const index = plane.indexFor(nextX, nextY);
      if (visited.has(index)) continue;
      if (!plane.canTraverse(x, y, nextX, nextY)) continue;
      visited.add(index);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

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
    expect(reachable(lvl.worldPlane, lvl.start, lvl.stairsDown)).toBe(true);
    expect(
      lvl.worldPlane.layers.elevation[
        lvl.worldPlane.indexFor(lvl.stairsDown[0], lvl.stairsDown[1])
      ],
    ).toBe(0);
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
    expect(level.worldPlane.getTile(...PARK_WORKSHOP_DOOR)).toBe(
      TileType.STAIRS_DOWN,
    );
    expect(reachable(level.worldPlane, level.start, PARK_WORKSHOP_DOOR)).toBe(
      true,
    );
  });

  it("builds a substantial, reachable pond and grotto away from Megacorp", () => {
    const level = createOutsideLevel();
    const waterCount = [...level.worldPlane.layers.ground].filter(
      (ground) =>
        ground === GroundType.WATER_SHALLOW ||
        ground === GroundType.WATER_DEEP ||
        ground === GroundType.WATER_RIVER,
    ).length;
    expect(waterCount).toBeGreaterThan(180);
    expect(
      level.worldPlane.layers.fixture.filter(
        (fixture) => fixture === FixtureType.STAIRS,
      ),
    ).toHaveLength(3);
    expect(reachable(level.worldPlane, level.start, OUTSIDE_CAVE_MOUTH)).toBe(
      true,
    );
  });
});
