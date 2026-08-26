import { describe, expect, it } from "vitest";
import { bresenhamLine } from "./bresenham";

describe("bresenhamLine", () => {
  it("should visit all points on a horizontal line", () => {
    const points: { x: number; y: number }[] = [];
    const result = bresenhamLine(0, 0, 3, 0, (x, y) => {
      points.push({ x, y });
      return true;
    });

    expect(result).toBe(true);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("should stop early if callback returns false", () => {
    const points: { x: number; y: number }[] = [];
    const result = bresenhamLine(0, 0, 5, 0, (x, y) => {
      points.push({ x, y });
      return x < 2; // Stop at x = 2
    });

    expect(result).toBe(false);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});
