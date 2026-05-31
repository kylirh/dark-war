import { describe, it, expect } from "vitest";
import { TileType } from "../types";
import {
  ChunkedTileSource,
  createDungeonChunkGenerator,
  CHUNK_SIZE,
} from "./chunked-map";

function hasLocalPath(
  tiles: TileType[],
  from: [number, number],
  to: [number, number],
): boolean {
  const key = (x: number, y: number): number => x + y * CHUNK_SIZE;
  const passable = (x: number, y: number): boolean => {
    const tile = tiles[key(x, y)];
    return tile === TileType.FLOOR || tile === TileType.DOOR_OPEN;
  };
  const visited = new Set<number>();
  const queue: [number, number][] = [from];
  visited.add(key(from[0], from[1]));

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CHUNK_SIZE || ny >= CHUNK_SIZE) continue;
      const k = key(nx, ny);
      if (visited.has(k) || !passable(nx, ny)) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }

  return false;
}

describe("ChunkedTileSource", () => {
  const seed = 12345;
  const gen = () => createDungeonChunkGenerator(seed);

  it("generates deterministically regardless of access order", () => {
    const a = new ChunkedTileSource(gen());
    const b = new ChunkedTileSource(gen());
    const coords: Array<[number, number]> = [];
    for (let i = 0; i < 200; i++) {
      coords.push([((i * 13) % 80) - 8, ((i * 29) % 80) - 8]);
    }
    for (const [x, y] of coords) a.getTile(x, y);
    for (let i = coords.length - 1; i >= 0; i--) {
      b.getTile(coords[i][0], coords[i][1]);
    }
    for (const [x, y] of coords) {
      expect(a.getTile(x, y)).toBe(b.getTile(x, y));
    }
  });

  it("connects neighbouring chunks at shared edge midpoints", () => {
    const src = new ChunkedTileSource(gen());
    const mid = CHUNK_SIZE >> 1;
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        const ex = cx * CHUNK_SIZE + (CHUNK_SIZE - 1);
        const ey = cy * CHUNK_SIZE + mid;
        expect(src.passable(ex, ey)).toBe(true);
        expect(src.passable(ex + 1, ey)).toBe(true);

        const sx = cx * CHUNK_SIZE + mid;
        const sy = cy * CHUNK_SIZE + (CHUNK_SIZE - 1);
        expect(src.passable(sx, sy)).toBe(true);
        expect(src.passable(sx, sy + 1)).toBe(true);
      }
    }
  });

  it("keeps the local centre connected to every chunk exit", () => {
    const generator = gen();
    const mid = CHUNK_SIZE >> 1;
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const chunk = generator(cx, cy);
        for (const exit of [
          [mid, 0],
          [mid, CHUNK_SIZE - 1],
          [0, mid],
          [CHUNK_SIZE - 1, mid],
        ] as [number, number][]) {
          expect(hasLocalPath(chunk, [mid, mid], exit)).toBe(true);
        }
      }
    }
  });

  it("generates doors and varied chunk layouts", () => {
    const generator = gen();
    let doorCount = 0;
    const signatures = new Set<string>();

    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const chunk = generator(cx, cy);
        signatures.add(chunk.join(","));
        doorCount += chunk.filter(
          (tile) =>
            tile === TileType.DOOR_CLOSED ||
            tile === TileType.DOOR_LOCKED ||
            tile === TileType.DOOR_OPEN,
        ).length;
      }
    }

    expect(doorCount).toBeGreaterThan(0);
    expect(signatures.size).toBeGreaterThan(8);
  });

  it("keeps edits as overrides that survive chunk eviction", () => {
    const src = new ChunkedTileSource(gen());
    src.setTile(40, 40, TileType.STAIRS_UP);
    src.unloadFarChunks(0, 0, 0); // evict everything except chunk (0,0)
    expect(src.getTile(40, 40)).toBe(TileType.STAIRS_UP);
  });

  it("loads and unloads chunks by region radius", () => {
    const src = new ChunkedTileSource(gen());
    src.ensureRegionAround(100, 100, 2); // 5x5
    expect(src.loadedChunkCount()).toBe(25);
    src.unloadFarChunks(100, 100, 1); // keep 3x3
    expect(src.loadedChunkCount()).toBe(9);
  });

  it("treats reads outside a bounded world as WALL", () => {
    const src = new ChunkedTileSource(gen(), { width: 32, height: 32 });
    expect(src.inBounds(40, 5)).toBe(false);
    expect(src.getTile(40, 5)).toBe(TileType.WALL);
  });

  it("materializes a region consistent with getTile", () => {
    const src = new ChunkedTileSource(gen());
    const region = src.materializeRegion(20, 20, 8, 6);
    for (let ry = 0; ry < 6; ry++) {
      for (let rx = 0; rx < 8; rx++) {
        expect(region[rx + ry * 8]).toBe(src.getTile(20 + rx, 20 + ry));
      }
    }
  });

  it("reflects setTile immediately in a loaded chunk", () => {
    const src = new ChunkedTileSource(gen());
    src.getTile(5, 5); // load chunk (0,0)
    src.setTile(5, 5, TileType.HOLE);
    expect(src.getTile(5, 5)).toBe(TileType.HOLE);
  });
});
