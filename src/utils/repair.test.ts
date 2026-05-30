import { describe, it, expect } from "vitest";
import { GameState, TileType } from "../types";
import {
  applyRepairAt,
  findNearestRepairTarget,
  hasAnyRepairTarget,
} from "./repair";
import { idxFor } from "./helpers";

const W = 7;
const H = 7;

function fakeState(): GameState {
  return {
    map: new Array(W * H).fill(TileType.FLOOR),
    mapWidth: W,
    mapHeight: H,
    wallDamage: new Array(W * H).fill(0),
    mapDirty: false,
  } as unknown as GameState;
}

describe("applyRepairAt", () => {
  it("fills a hole back to floor", () => {
    const state = fakeState();
    const i = idxFor(3, 3, W);
    state.map[i] = TileType.HOLE;
    expect(applyRepairAt(state, 3, 3)).toBe("hole");
    expect(state.map[i]).toBe(TileType.FLOOR);
    expect(state.mapDirty).toBe(true);
  });

  it("reduces damage on a damaged tile without fully repairing in one step", () => {
    const state = fakeState();
    const i = idxFor(3, 3, W);
    state.map[i] = TileType.WALL;
    state.wallDamage[i] = 9;
    expect(applyRepairAt(state, 3, 3)).toBe("damaged");
    expect(state.wallDamage[i]).toBe(6); // repairs by 3
    expect(state.mapDirty).toBe(false); // not fully repaired
  });

  it("marks mapDirty when a wall is fully repaired", () => {
    const state = fakeState();
    const i = idxFor(3, 3, W);
    state.map[i] = TileType.WALL;
    state.wallDamage[i] = 2;
    expect(applyRepairAt(state, 3, 3)).toBe("damaged");
    expect(state.wallDamage[i]).toBe(0);
    expect(state.mapDirty).toBe(true);
  });

  it("returns false for undamaged tiles and out of bounds", () => {
    const state = fakeState();
    expect(applyRepairAt(state, 3, 3)).toBe(false); // floor, no damage
    expect(applyRepairAt(state, -1, 3)).toBe(false);
  });
});

describe("findNearestRepairTarget / hasAnyRepairTarget", () => {
  it("returns null and false when nothing needs repair", () => {
    const state = fakeState();
    expect(findNearestRepairTarget(state, 3, 3, 3)).toBeNull();
    expect(hasAnyRepairTarget(state)).toBe(false);
  });

  it("finds the nearest of several repairable tiles within radius", () => {
    const state = fakeState();
    state.map[idxFor(5, 3, W)] = TileType.HOLE; // distance 2
    state.map[idxFor(4, 3, W)] = TileType.WALL; // distance 1
    state.wallDamage[idxFor(4, 3, W)] = 4;
    expect(findNearestRepairTarget(state, 3, 3, 4)).toEqual([4, 3]);
    expect(hasAnyRepairTarget(state)).toBe(true);
  });

  it("respects the search radius", () => {
    const state = fakeState();
    state.map[idxFor(6, 6, W)] = TileType.HOLE;
    expect(findNearestRepairTarget(state, 0, 0, 2)).toBeNull();
    expect(hasAnyRepairTarget(state)).toBe(true); // full scan still finds it
  });
});
