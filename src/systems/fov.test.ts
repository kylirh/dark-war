import { describe, it, expect } from "vitest";
import { TileType, Player } from "../types";
import { computeFOVFrom, computeFOV } from "./fov";
import { idxFor } from "../utils/helpers";

const W = 11;
const H = 11;

function openMap(): TileType[] {
  return new Array(W * H).fill(TileType.FLOOR);
}

describe("computeFOVFrom", () => {
  it("sees its own tile and nearby open floor", () => {
    const visible = computeFOVFrom(openMap(), 5, 5, 5, W, H);
    expect(visible.has(idxFor(5, 5, W))).toBe(true);
    expect(visible.has(idxFor(6, 5, W))).toBe(true);
    expect(visible.has(idxFor(5, 6, W))).toBe(true);
  });

  it("does not see past an opaque wall", () => {
    const map = openMap();
    map[idxFor(7, 5, W)] = TileType.WALL; // wall to the east
    const visible = computeFOVFrom(map, 5, 5, 6, W, H);
    // The tile two steps past the wall should be hidden.
    expect(visible.has(idxFor(9, 5, W))).toBe(false);
  });

  it("respects the radius", () => {
    const visible = computeFOVFrom(openMap(), 5, 5, 2, W, H);
    expect(visible.has(idxFor(5, 5, W))).toBe(true);
    expect(visible.has(idxFor(10, 10, W))).toBe(false); // far corner
  });
});

describe("computeFOV", () => {
  it("accumulates visible tiles into the explored set", () => {
    const map = openMap();
    const explored = new Set<number>();
    const player = { gridX: 5, gridY: 5, sight: 4 } as unknown as Player;
    const visible = computeFOV(map, player, explored, W, H);
    expect(visible.size).toBeGreaterThan(0);
    for (const i of visible) expect(explored.has(i)).toBe(true);
  });
});
