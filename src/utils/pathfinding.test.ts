import { describe, it, expect } from "vitest";
import { TileType, Entity, EntityKind } from "../types";
import { findPath, findPathToClosestReachable } from "./pathfinding";
import { idxFor } from "./helpers";

const W = 8;
const H = 8;

function openMap(): TileType[] {
  const map = new Array(W * H).fill(TileType.FLOOR);
  for (let x = 0; x < W; x++) {
    map[x] = TileType.WALL;
    map[x + (H - 1) * W] = TileType.WALL;
  }
  for (let y = 0; y < H; y++) {
    map[y * W] = TileType.WALL;
    map[W - 1 + y * W] = TileType.WALL;
  }
  return map;
}

function fullyExplored(): Set<number> {
  const set = new Set<number>();
  for (let i = 0; i < W * H; i++) set.add(i);
  return set;
}

function monsterAt(x: number, y: number): Entity {
  return { id: `m${x}-${y}`, kind: EntityKind.MONSTER, gridX: x, gridY: y } as unknown as Entity;
}

describe("findPath", () => {
  it("finds a path across open floor", () => {
    const path = findPath(1, 1, 5, 5, openMap(), fullyExplored(), [], W, H);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual([1, 1]);
    expect(path![path!.length - 1]).toEqual([5, 5]);
  });

  it("returns null for an unexplored destination", () => {
    const explored = new Set<number>([idxFor(1, 1, W)]);
    expect(findPath(1, 1, 5, 5, openMap(), explored, [], W, H)).toBeNull();
  });

  it("returns null when the destination is a wall", () => {
    expect(findPath(1, 1, 0, 0, openMap(), fullyExplored(), [], W, H)).toBeNull();
  });
});

describe("findPathToClosestReachable", () => {
  it("reaches an open target", () => {
    const path = findPathToClosestReachable(1, 1, 6, 6, openMap(), fullyExplored(), [], W, H);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual([6, 6]);
  });

  it("routes to the closest reachable tile when the target is blocked", () => {
    const map = openMap();
    // Wall off the target cell entirely.
    map[idxFor(5, 6, W)] = TileType.WALL;
    map[idxFor(6, 5, W)] = TileType.WALL;
    map[idxFor(5, 5, W)] = TileType.WALL;
    const path = findPathToClosestReachable(1, 1, 6, 6, map, fullyExplored(), [], W, H);
    // A path is still returned, ending somewhere other than the blocked target.
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).not.toEqual([6, 6]);
  });

  it("treats monsters as blocking except at the destination", () => {
    const blockers = [monsterAt(3, 1), monsterAt(3, 2), monsterAt(3, 3)];
    const map = openMap();
    // Column x=3 (rows 1..6) walled except where monsters stand, forcing detour.
    for (let y = 4; y <= 6; y++) map[idxFor(3, y, W)] = TileType.WALL;
    const path = findPathToClosestReachable(1, 1, 6, 1, map, fullyExplored(), blockers, W, H);
    expect(path).not.toBeNull();
    // The path must not step onto a monster tile.
    for (const [x, y] of path!) {
      expect(blockers.some((m) => m.gridX === x && m.gridY === y)).toBe(false);
    }
  });
});
