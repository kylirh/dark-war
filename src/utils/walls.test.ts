import { describe, it, expect } from "vitest";
import { GameState, TileType, WALL_MAX_DAMAGE, FLOOR_MAX_DAMAGE } from "../types";
import { applyWallDamageAt, applyWallDamageAtIndex } from "./walls";
import { idxFor } from "./helpers";

const W = 5;
const H = 5;

function fakeState(fill: TileType = TileType.WALL): GameState {
  const map = new Array(W * H).fill(fill);
  // Solid border so interior tiles are 1..3.
  for (let x = 0; x < W; x++) {
    map[x] = TileType.WALL;
    map[x + (H - 1) * W] = TileType.WALL;
  }
  for (let y = 0; y < H; y++) {
    map[y * W] = TileType.WALL;
    map[W - 1 + y * W] = TileType.WALL;
  }
  return {
    map,
    mapWidth: W,
    mapHeight: H,
    wallDamage: new Array(W * H).fill(0),
    mapDirty: false,
    holeCreatedTiles: new Set<number>(),
  } as unknown as GameState;
}

describe("applyWallDamageAt", () => {
  it("ignores out-of-bounds and border tiles", () => {
    const state = fakeState();
    expect(applyWallDamageAt(state, -1, 2, 5)).toBe(false);
    expect(applyWallDamageAt(state, 0, 2, 5)).toBe(false); // border
    expect(applyWallDamageAt(state, 2, 0, 5)).toBe(false); // border
  });

  it("accumulates damage and destroys a wall into floor at max", () => {
    const state = fakeState();
    state.map[idxFor(2, 2, W)] = TileType.WALL;
    expect(applyWallDamageAt(state, 2, 2, WALL_MAX_DAMAGE - 1)).toBe(true);
    expect(state.map[idxFor(2, 2, W)]).toBe(TileType.WALL); // not yet destroyed
    applyWallDamageAt(state, 2, 2, 1);
    expect(state.map[idxFor(2, 2, W)]).toBe(TileType.FLOOR);
    expect(state.wallDamage[idxFor(2, 2, W)]).toBe(0);
    expect(state.mapDirty).toBe(true);
  });

  it("turns a destroyed floor into a tracked hole", () => {
    const state = fakeState(TileType.FLOOR);
    const i = idxFor(2, 2, W);
    state.map[i] = TileType.FLOOR;
    applyWallDamageAt(state, 2, 2, FLOOR_MAX_DAMAGE);
    expect(state.map[i]).toBe(TileType.HOLE);
    expect(state.holeCreatedTiles?.has(i)).toBe(true);
  });

  it("rejects non-damageable tiles", () => {
    const state = fakeState();
    const i = idxFor(2, 2, W);
    state.map[i] = TileType.STAIRS_DOWN;
    expect(applyWallDamageAtIndex(state, i, 5)).toBe(false);
  });

  it("rejects an out-of-range tile index", () => {
    const state = fakeState();
    expect(applyWallDamageAtIndex(state, -1, 5)).toBe(false);
    expect(applyWallDamageAtIndex(state, 9999, 5)).toBe(false);
  });
});
