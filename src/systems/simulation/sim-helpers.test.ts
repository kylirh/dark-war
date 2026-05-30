import { describe, it, expect } from "vitest";
import { TileType } from "../../types";
import { FlatTileSource } from "../../core/tile-source";
import {
  directionFromAngle,
  normalizeAngle,
  hasClearLineOfSight,
} from "./sim-helpers";

describe("directionFromAngle", () => {
  it("maps cardinal angles to unit steps", () => {
    expect(directionFromAngle(0)).toEqual([1, 0]);
    expect(directionFromAngle(Math.PI / 2)).toEqual([0, 1]);
    expect(directionFromAngle(Math.PI)).toEqual([-1, 0]);
    expect(directionFromAngle(-Math.PI / 2)).toEqual([0, -1]);
  });

  it("maps diagonal angles", () => {
    expect(directionFromAngle(Math.PI / 4)).toEqual([1, 1]);
    expect(directionFromAngle((3 * Math.PI) / 4)).toEqual([-1, 1]);
  });

  it("rounds to the nearest of eight directions", () => {
    expect(directionFromAngle(0.1)).toEqual([1, 0]);
    expect(directionFromAngle(Math.PI / 2 - 0.1)).toEqual([0, 1]);
  });
});

describe("normalizeAngle", () => {
  it("keeps angles already in range", () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  it("wraps angles into (-PI, PI]", () => {
    expect(normalizeAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeAngle(-(3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2);
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
  });
});

describe("hasClearLineOfSight", () => {
  const W = 8;
  const H = 3;
  const source = (map: TileType[]) => new FlatTileSource(map, W, H);
  const openRow = () => new Array(W * H).fill(TileType.FLOOR);
  const center = (gx: number) => gx * 32 + 16;

  it("is clear across open floor", () => {
    const map = openRow();
    expect(hasClearLineOfSight(source(map), center(1), center(1), center(6), center(1))).toBe(true);
  });

  it("is blocked by an opaque wall between the endpoints", () => {
    const map = openRow();
    map[3 + 1 * W] = TileType.WALL; // opaque tile in the path
    expect(hasClearLineOfSight(source(map), center(1), center(1), center(6), center(1))).toBe(false);
  });

  it("ignores opaque tiles exactly at the endpoints", () => {
    const map = openRow();
    map[1 + 1 * W] = TileType.WALL; // start cell
    map[6 + 1 * W] = TileType.WALL; // end cell
    expect(hasClearLineOfSight(source(map), center(1), center(1), center(6), center(1))).toBe(true);
  });
});
