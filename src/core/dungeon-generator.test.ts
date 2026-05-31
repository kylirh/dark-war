import { describe, it, expect } from "vitest";
import { TileType } from "../types";
import { RandomNumberGenerator } from "../utils/rng";
import { passableFor } from "../utils/helpers";
import { generateDungeon, reachableFloorCount } from "./dungeon-generator";

const W = 96;
const H = 72;

function gen(seed: number) {
  return generateDungeon(W, H, 1, new RandomNumberGenerator(seed));
}

describe("generateDungeon", () => {
  it("produces a full-size map with a sealed border", () => {
    const d = gen(1);
    expect(d.map).toHaveLength(W * H);
    for (let x = 0; x < W; x++) {
      expect(d.map[x]).toBe(TileType.WALL);
      expect(d.map[x + (H - 1) * W]).toBe(TileType.WALL);
    }
    for (let y = 0; y < H; y++) {
      expect(d.map[y * W]).toBe(TileType.WALL);
      expect(d.map[W - 1 + y * W]).toBe(TileType.WALL);
    }
  });

  it("places the start and far-away down-stairs on reachable floor", () => {
    const d = gen(2);
    expect(passableFor(d.map, d.start[0], d.start[1], W, H)).toBe(true);
    expect(d.map[d.stairsDown[0] + d.stairsDown[1] * W]).toBe(
      TileType.STAIRS_DOWN,
    );
    // Stairs should be a meaningful distance from the start.
    const dist =
      Math.abs(d.stairsDown[0] - d.start[0]) +
      Math.abs(d.stairsDown[1] - d.start[1]);
    expect(dist).toBeGreaterThan(20);
  });

  it("is fully connected — the stairs are reachable from the start", () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const d = generateDungeon(W, H, 1, new RandomNumberGenerator(seed));
      const reachable = new Set<number>();
      // flood from start, then confirm stairs tile was reached
      const queue: Array<[number, number]> = [d.start];
      reachable.add(d.start[0] + d.start[1] * W);
      while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as Array<[number, number]>) {
          const nx = x + dx;
          const ny = y + dy;
          if (!passableFor(d.map, nx, ny, W, H)) continue;
          const k = nx + ny * W;
          if (reachable.has(k)) continue;
          reachable.add(k);
          queue.push([nx, ny]);
        }
      }
      expect(reachable.has(d.stairsDown[0] + d.stairsDown[1] * W)).toBe(true);
    }
  });

  it("carves multiple rooms, doors, and a good amount of floor", () => {
    const d = gen(5);
    expect(d.rooms.length).toBeGreaterThan(5);
    const floors = d.map.filter((t) => t === TileType.FLOOR).length;
    expect(floors).toBeGreaterThan(500);
    const doors = d.map.filter(
      (t) => t === TileType.DOOR_CLOSED || t === TileType.DOOR_LOCKED,
    ).length;
    expect(doors).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    expect(gen(123).map).toEqual(gen(123).map);
    expect(gen(123).map).not.toEqual(gen(124).map);
  });

  it("reachableFloorCount counts the connected component", () => {
    const d = gen(8);
    expect(reachableFloorCount(d.map, W, H, d.start)).toBeGreaterThan(100);
  });
});
