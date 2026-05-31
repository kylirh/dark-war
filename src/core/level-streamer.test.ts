import { describe, it, expect } from "vitest";
import { TileType } from "../types";
import { idxFor } from "../utils/helpers";
import { LevelStreamer } from "./level-streamer";
import { CHUNK_SIZE } from "./chunked-map";

const W = 64;
const H = 48;

function wallMap(): TileType[] {
  return new Array(W * H).fill(TileType.WALL);
}

describe("LevelStreamer", () => {
  it("carves floor around the requested position and tracks generated chunks", () => {
    const map = wallMap();
    const s = new LevelStreamer(123, W, H, null, [W - 8, H - 8]);
    const before = map.filter((t) => t === TileType.FLOOR).length;
    const res = s.ensureAround(map, 24, 24, 1);
    const after = map.filter((t) => t === TileType.FLOOR).length;

    expect(after).toBeGreaterThan(before);
    expect(res.changed.length).toBeGreaterThan(0);
    expect(res.newChunks.length).toBe(9); // 3x3 chunks
    expect(s.isChunkGenerated(1, 1)).toBe(true);
  });

  it("does not regenerate already-generated chunks", () => {
    const map = wallMap();
    const s = new LevelStreamer(7, W, H, null, null);
    s.ensureAround(map, 24, 24, 1);
    const second = s.ensureAround(map, 24, 24, 1);
    expect(second.changed.length).toBe(0);
    expect(second.newChunks.length).toBe(0);
  });

  it("keeps the outer world border solid", () => {
    const map = wallMap();
    const s = new LevelStreamer(99, W, H, null, null);
    s.ensureAround(map, 8, 8, 0);
    for (let x = 0; x < W; x++) {
      expect(map[idxFor(x, 0, W)]).toBe(TileType.WALL);
      expect(map[idxFor(x, H - 1, W)]).toBe(TileType.WALL);
    }
  });

  it("places stairs when their chunk is generated", () => {
    const map = wallMap();
    const stairs: [number, number] = [40, 24];
    const s = new LevelStreamer(5, W, H, null, stairs);
    s.ensureAround(map, stairs[0], stairs[1], 0);
    expect(map[idxFor(stairs[0], stairs[1], W)]).toBe(TileType.STAIRS_DOWN);
  });

  it("preserves generated doors in the streamed map", () => {
    const map = wallMap();
    const s = new LevelStreamer(123, W, H, null, null);
    s.ensureAround(map, 24, 24, 1);
    const doorCount = map.filter(
      (tile) =>
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_LOCKED ||
        tile === TileType.DOOR_OPEN,
    ).length;

    expect(doorCount).toBeGreaterThan(0);
  });

  it("connects adjacent generated chunks at the shared edge midpoint", () => {
    const map = wallMap();
    const s = new LevelStreamer(42, W, H, null, null);
    s.ensureAround(map, CHUNK_SIZE, CHUNK_SIZE, 1);
    const mid = CHUNK_SIZE >> 1;
    // East edge of chunk (1,1) meets west edge of chunk (2,1).
    const ex = 1 * CHUNK_SIZE + (CHUNK_SIZE - 1);
    const ey = 1 * CHUNK_SIZE + mid;
    expect(map[idxFor(ex, ey, W)]).toBe(TileType.FLOOR);
    expect(map[idxFor(ex + 1, ey, W)]).toBe(TileType.FLOOR);
  });

  it("re-derives generated chunks from a populated map", () => {
    const map = wallMap();
    const a = new LevelStreamer(1, W, H, null, null);
    a.ensureAround(map, 24, 24, 1);

    const b = new LevelStreamer(1, W, H, null, null);
    b.markGeneratedFromMap(map);
    expect(b.isChunkGenerated(1, 1)).toBe(true);
    // A chunk outside the carved 3x3 region (chunks 0..2) stays ungenerated.
    expect(b.isChunkGenerated(3, 2)).toBe(false);
  });
});
