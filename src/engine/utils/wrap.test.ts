import { describe, it, expect } from "vitest";
import { wrapValue, wrapDelta, nearestWrappedImage } from "./wrap";

describe("wrapValue", () => {
  it("folds into [0, span)", () => {
    expect(wrapValue(0, 10)).toBe(0);
    expect(wrapValue(9, 10)).toBe(9);
    expect(wrapValue(10, 10)).toBe(0);
    expect(wrapValue(11, 10)).toBe(1);
    expect(wrapValue(-1, 10)).toBe(9);
    expect(wrapValue(-11, 10)).toBe(9);
    expect(wrapValue(25, 10)).toBe(5);
  });

  it("is a no-op for non-positive spans", () => {
    expect(wrapValue(7, 0)).toBe(7);
  });
});

describe("wrapDelta", () => {
  it("takes the short way around the ring", () => {
    expect(wrapDelta(1, 9, 10)).toBe(-2); // go left across the seam
    expect(wrapDelta(9, 1, 10)).toBe(2); // go right across the seam
    expect(wrapDelta(2, 5, 10)).toBe(3); // straight, no seam
    expect(wrapDelta(0, 0, 10)).toBe(0);
  });

  it("stays within [-span/2, span/2)", () => {
    for (let from = 0; from < 10; from++) {
      for (let to = 0; to < 10; to++) {
        const d = wrapDelta(from, to, 10);
        expect(d).toBeGreaterThanOrEqual(-5);
        expect(d).toBeLessThan(5);
        // The delta must actually land on `to` modulo span.
        expect(wrapValue(from + d, 10)).toBe(to);
      }
    }
  });
});

describe("nearestWrappedImage", () => {
  it("picks the copy of value closest to the reference", () => {
    // value 9 near reference 1 on a 10-ring → -1 (i.e. 9 - 10)
    expect(nearestWrappedImage(9, 1, 10)).toBe(-1);
    // value 1 near reference 9 → 11 (i.e. 1 + 10)
    expect(nearestWrappedImage(1, 9, 10)).toBe(11);
    // already close: no shift
    expect(nearestWrappedImage(4, 5, 10)).toBe(4);
  });

  it("is congruent to value modulo span", () => {
    expect(wrapValue(nearestWrappedImage(9, 1, 10), 10)).toBe(9);
    expect(wrapValue(nearestWrappedImage(1, 9, 10), 10)).toBe(1);
  });
});
