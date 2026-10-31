/**
 * The reuse contract of `findPathToClosestReachable`'s shared scratch buffers.
 *
 * Those buffers are module-level mutable state, so every search inherits
 * whatever the previous one left behind. `pathfinding.ts` states two safety
 * properties in prose — the per-call resets, and growth to fit the largest
 * level seen — and nothing enforced either. Both are pinned here.
 *
 * This lives in its own file on purpose: vitest isolates module state per test
 * file, so these tests start from freshly allocated (zero-length) buffers and
 * cannot be weakened by the search sizes other tests happen to use first.
 */

import { describe, it, expect } from "vitest";
import { TileType, Entity, EntityKind } from "../types";
import { findPath } from "./pathfinding";
import { idxFor } from "./helpers";
import { FlatTileSource } from "../core/tile-source";

const W = 8;
const H = 8;

/** An 8x8 map whose only interior route is the corridor along `y = 1`. */
function corridorMap(): FlatTileSource {
  const map: TileType[] = new Array(W * H).fill(TileType.WALL);
  for (let x = 1; x <= 6; x++) map[idxFor(x, 1, W)] = TileType.FLOOR;
  return new FlatTileSource(map, W, H);
}

/** A larger open map with a wall border, deliberately bigger than 8x8. */
function largeOpenSource(size: number): FlatTileSource {
  const map: TileType[] = new Array(size * size).fill(TileType.FLOOR);
  for (let i = 0; i < size; i++) {
    map[idxFor(i, 0, size)] = TileType.WALL;
    map[idxFor(i, size - 1, size)] = TileType.WALL;
    map[idxFor(0, i, size)] = TileType.WALL;
    map[idxFor(size - 1, i, size)] = TileType.WALL;
  }
  return new FlatTileSource(map, size, size);
}

function allExplored(cellCount: number): Set<number> {
  const set = new Set<number>();
  for (let i = 0; i < cellCount; i++) set.add(i);
  return set;
}

function monsterAt(x: number, y: number): Entity {
  return {
    id: `m${x}-${y}`,
    kind: EntityKind.MONSTER,
    gridX: x,
    gridY: y,
  } as unknown as Entity;
}

const CORRIDOR_ROUTE: [number, number][] = [
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 1],
];

describe("shared pathfinding scratch buffers", () => {
  it("clears the monster mask between searches", () => {
    const explored = allExplored(W * H);

    // A monster mid-corridor is the only thing blocking the one route there is,
    // so this search cannot reach the far end.
    expect(
      findPath(1, 1, 6, 1, corridorMap(), explored, [monsterAt(3, 1)]),
    ).toBeNull();

    // The same search with no entities must find the corridor again. A monster
    // mask left over from the search above would keep (3, 1) blocked for the
    // rest of the process, on every level, with no monster standing there.
    expect(findPath(1, 1, 6, 1, corridorMap(), explored, [])).toEqual(
      CORRIDOR_ROUTE,
    );
  });

  it("grows the buffers for a level larger than the last one searched", () => {
    // Search a small level first so the buffers are allocated at 8x8.
    expect(findPath(1, 1, 6, 1, corridorMap(), allExplored(W * H), [])).toEqual(
      CORRIDOR_ROUTE,
    );

    // Then a level that needs more cells than those buffers hold. Writes past
    // the end of a typed array are dropped silently rather than throwing, so a
    // search that failed to grow would quietly return a path to somewhere else.
    const size = 48;
    const path = findPath(
      1,
      1,
      size - 2,
      size - 2,
      largeOpenSource(size),
      allExplored(size * size),
      [],
    );

    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual([size - 2, size - 2]);
    // Chebyshev distance on open floor, so the shortest route is one diagonal
    // run: 45 steps, 46 cells. Pins the whole route length without depending on
    // which equal-cost diagonal the tie-break picks.
    expect(path!.length).toBe(size - 2);
  });
});
