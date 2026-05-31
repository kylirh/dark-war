import { describe, it, expect } from "vitest";
import { TileType, Player } from "../types";
import { FlatTileSource } from "../core/tile-source";
import { computeFOVFrom, computeFOV } from "./fov";
import { idxFor } from "../utils/helpers";

const W = 11;
const H = 11;

function openSource(): FlatTileSource {
  return new FlatTileSource(new Array(W * H).fill(TileType.FLOOR), W, H);
}

describe("computeFOVFrom", () => {
  it("sees its own tile and nearby open floor", () => {
    const visible = computeFOVFrom(openSource(), 5, 5, 5);
    expect(visible.has(idxFor(5, 5, W))).toBe(true);
    expect(visible.has(idxFor(6, 5, W))).toBe(true);
    expect(visible.has(idxFor(5, 6, W))).toBe(true);
  });

  it("does not see past an opaque wall", () => {
    const src = openSource();
    src.setTile(7, 5, TileType.WALL); // wall to the east
    const visible = computeFOVFrom(src, 5, 5, 6);
    // The tile two steps past the wall should be hidden.
    expect(visible.has(idxFor(9, 5, W))).toBe(false);
  });

  it("does not wrap sight across the seam when wraps is false", () => {
    const visible = computeFOVFrom(openSource(), 0, 0, 4, false);
    expect(visible.has(idxFor(W - 1, 0, W))).toBe(false);
    expect(visible.has(idxFor(0, H - 1, W))).toBe(false);
  });

  it("wraps sight across the seam when wraps is true", () => {
    // Standing in the top-left corner of the torus, the right and bottom edges
    // are each one step away across the seam and should light up.
    const visible = computeFOVFrom(openSource(), 0, 0, 4, true);
    expect(visible.has(idxFor(W - 1, 0, W))).toBe(true); // one step left, wrapped
    expect(visible.has(idxFor(0, H - 1, W))).toBe(true); // one step up, wrapped
  });

  it("respects the radius", () => {
    const visible = computeFOVFrom(openSource(), 5, 5, 2);
    expect(visible.has(idxFor(5, 5, W))).toBe(true);
    expect(visible.has(idxFor(10, 10, W))).toBe(false); // far corner
  });
});

describe("computeFOV", () => {
  it("accumulates visible tiles into the explored set", () => {
    const explored = new Set<number>();
    const player = { gridX: 5, gridY: 5, sight: 4 } as unknown as Player;
    const visible = computeFOV(openSource(), player, explored);
    expect(visible.size).toBeGreaterThan(0);
    for (const i of visible) expect(explored.has(i)).toBe(true);
  });
});
