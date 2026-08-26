/** Coverage for the shared Bresenham grid-line walk. */

import { describe, expect, it } from "vitest";
import { bresenhamLine } from "./bresenham";

/** Collect every cell the walk visits, letting it run to completion. */
function trace(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const points: [number, number][] = [];
  bresenhamLine(x0, y0, x1, y1, (x, y) => {
    points.push([x, y]);
    return true;
  });
  return points;
}

describe("bresenhamLine", () => {
  it("visits every cell on a horizontal line", () => {
    expect(trace(0, 0, 3, 0)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("visits every cell on a vertical line", () => {
    expect(trace(2, 5, 2, 2)).toEqual([
      [2, 5],
      [2, 4],
      [2, 3],
      [2, 2],
    ]);
  });

  it("visits every cell on a perfect diagonal", () => {
    expect(trace(0, 0, 3, 3)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("steps the major axis on a shallow line", () => {
    expect(trace(0, 0, 4, 2)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
    ]);
  });

  it("steps the major axis on a steep line", () => {
    expect(trace(0, 0, 2, 4)).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
    ]);
  });

  it("walks negative directions", () => {
    expect(trace(0, 0, -4, -2)).toEqual([
      [0, 0],
      [-1, 0],
      [-2, -1],
      [-3, -1],
      [-4, -2],
    ]);
  });

  it("breaks ties from the start endpoint, so reversing shifts the minor axis", () => {
    // Both directions cover the same span and length, but the half-step lands
    // on a different row. Line-of-sight checks must not assume symmetry.
    const forward = trace(0, 0, -4, -2);
    const backward = trace(-4, -2, 0, 0);

    expect(backward).toEqual([
      [-4, -2],
      [-3, -2],
      [-2, -1],
      [-1, -1],
      [0, 0],
    ]);
    expect(backward).toHaveLength(forward.length);
    expect(backward).not.toEqual([...forward].reverse());
  });

  it("visits a zero-length line exactly once", () => {
    expect(trace(7, 9, 7, 9)).toEqual([[7, 9]]);
  });

  it("returns true when the walk reaches the end", () => {
    expect(bresenhamLine(0, 0, 3, 3, () => true)).toBe(true);
  });

  it("stops early and returns false when the callback rejects a cell", () => {
    const points: [number, number][] = [];
    const completed = bresenhamLine(0, 0, 5, 0, (x, y) => {
      points.push([x, y]);
      return x < 2;
    });

    expect(completed).toBe(false);
    expect(points).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it("stops on the very first cell when the callback rejects it", () => {
    let calls = 0;
    const completed = bresenhamLine(0, 0, 9, 9, () => {
      calls++;
      return false;
    });

    expect(completed).toBe(false);
    expect(calls).toBe(1);
  });
});
