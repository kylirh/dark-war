import { describe, it, expect } from "vitest";
import { TileType } from "../types";
import { tileAtFor, passableFor, inBoundsFor } from "../utils/helpers";
import { FlatTileSource, tileIsPassable } from "./tile-source";

describe("tileIsPassable", () => {
  it("treats floors as passable and walls as blocking", () => {
    expect(tileIsPassable(TileType.FLOOR)).toBe(true);
    expect(tileIsPassable(TileType.WALL)).toBe(false);
  });

  it("treats closed and locked doors as blocking, open doors as passable", () => {
    expect(tileIsPassable(TileType.DOOR_CLOSED)).toBe(false);
    expect(tileIsPassable(TileType.DOOR_LOCKED)).toBe(false);
    expect(tileIsPassable(TileType.DOOR_OPEN)).toBe(true);
  });
});

describe("FlatTileSource", () => {
  const W = 12;
  const H = 9;
  const palette = [
    TileType.WALL,
    TileType.FLOOR,
    TileType.DOOR_CLOSED,
    TileType.DOOR_OPEN,
    TileType.HOLE,
  ];
  const makeMap = () =>
    Array.from({ length: W * H }, (_, i) => palette[(i * 7) % palette.length]);

  it("matches the *For helpers exactly across and beyond bounds", () => {
    const map = makeMap();
    const src = new FlatTileSource(map, W, H);
    for (let y = -1; y <= H; y++) {
      for (let x = -1; x <= W; x++) {
        expect(src.inBounds(x, y)).toBe(inBoundsFor(x, y, W, H));
        expect(src.getTile(x, y)).toBe(tileAtFor(map, x, y, W, H));
        expect(src.passable(x, y)).toBe(passableFor(map, x, y, W, H));
      }
    }
  });

  it("returns WALL for out-of-bounds reads", () => {
    const src = new FlatTileSource(makeMap(), W, H);
    expect(src.getTile(-1, 0)).toBe(TileType.WALL);
    expect(src.getTile(W, 0)).toBe(TileType.WALL);
    expect(src.getTile(0, H)).toBe(TileType.WALL);
  });

  it("writes through to the backing array and ignores out-of-bounds writes", () => {
    const map = makeMap();
    const src = new FlatTileSource(map, W, H);
    src.setTile(3, 3, TileType.STAIRS_DOWN);
    expect(map[3 + 3 * W]).toBe(TileType.STAIRS_DOWN);
    expect(() => src.setTile(-5, -5, TileType.FLOOR)).not.toThrow();
    expect(src.getTile(-5, -5)).toBe(TileType.WALL);
  });

  it("exposes the backing array via raw", () => {
    const map = makeMap();
    const src = new FlatTileSource(map, W, H);
    expect(src.raw).toBe(map);
  });
});
