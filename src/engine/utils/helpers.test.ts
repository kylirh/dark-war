import { describe, it, expect } from "vitest";
import { TileType, Entity } from "../types";
import {
  idxFor,
  inBoundsFor,
  tileAtFor,
  setTileFor,
  passableFor,
  dist,
  setPositionFromGrid,
  EIGHT_WAY_DIRECTIONS,
} from "./helpers";

describe("index math", () => {
  it("idxFor uses an explicit width", () => {
    expect(idxFor(3, 2, 10)).toBe(23);
  });
});

describe("bounds", () => {
  it("inBoundsFor respects explicit dimensions", () => {
    expect(inBoundsFor(0, 0, 5, 5)).toBe(true);
    expect(inBoundsFor(4, 4, 5, 5)).toBe(true);
    expect(inBoundsFor(5, 0, 5, 5)).toBe(false);
    expect(inBoundsFor(-1, 0, 5, 5)).toBe(false);
  });
});

describe("tile read/write", () => {
  it("tileAtFor returns WALL out of bounds and the stored tile in bounds", () => {
    const map = [TileType.FLOOR, TileType.HOLE, TileType.WALL, TileType.FLOOR];
    expect(tileAtFor(map, 0, 0, 2, 2)).toBe(TileType.FLOOR);
    expect(tileAtFor(map, 1, 0, 2, 2)).toBe(TileType.HOLE);
    expect(tileAtFor(map, -1, 0, 2, 2)).toBe(TileType.WALL);
    expect(tileAtFor(map, 9, 9, 2, 2)).toBe(TileType.WALL);
  });

  it("setTileFor / tileAtFor round-trip", () => {
    const map = new Array(9).fill(TileType.WALL);
    setTileFor(map, 1, 1, 3, TileType.STAIRS_DOWN);
    expect(tileAtFor(map, 1, 1, 3, 3)).toBe(TileType.STAIRS_DOWN);
  });
});

describe("passability", () => {
  const map = [
    TileType.FLOOR,
    TileType.WALL,
    TileType.DOOR_OPEN,
    TileType.DOOR_CLOSED,
  ];
  it("passableFor reflects tile blocking and bounds", () => {
    expect(passableFor(map, 0, 0, 2, 2)).toBe(true); // floor
    expect(passableFor(map, 1, 0, 2, 2)).toBe(false); // wall
    expect(passableFor(map, 0, 1, 2, 2)).toBe(true); // open door
    expect(passableFor(map, 1, 1, 2, 2)).toBe(false); // closed door
    expect(passableFor(map, -1, 0, 2, 2)).toBe(false); // OOB
  });
});

describe("dist", () => {
  it("computes Manhattan distance", () => {
    expect(dist([0, 0], [3, 4])).toBe(7);
    expect(dist([2, 2], [2, 2])).toBe(0);
  });
});

describe("setPositionFromGrid", () => {
  it("centers the entity in the cell and resets interpolation", () => {
    const entity = {
      worldX: 0,
      worldY: 0,
      prevWorldX: 0,
      prevWorldY: 0,
    } as Entity;
    setPositionFromGrid(entity, 2, 3);
    expect(entity.worldX).toBe(2 * 32 + 16);
    expect(entity.worldY).toBe(3 * 32 + 16);
    expect(entity.prevWorldX).toBe(entity.worldX);
    expect(entity.prevWorldY).toBe(entity.worldY);
  });
});

describe("EIGHT_WAY_DIRECTIONS", () => {
  it("keeps the iteration order its consumers depend on", () => {
    // Pinned, not incidental: findPathToClosestReachable breaks equal-cost
    // ties in this order and chooseIdleWanderDirection draws from it with
    // RNG, so a reorder changes pathfinding output and monster wander for an
    // identical seed. Notably it is *not* angular order, which is why
    // directionFromAngle keeps a separate array.
    expect(EIGHT_WAY_DIRECTIONS).toEqual([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  });

  it("covers each of the eight neighbours exactly once", () => {
    const keys = new Set(EIGHT_WAY_DIRECTIONS.map(([dx, dy]) => `${dx},${dy}`));
    expect(keys.size).toBe(8);
    expect(keys.has("0,0")).toBe(false);
  });
});
