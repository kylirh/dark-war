/** Tests for deterministic ground and shoreline transition masks. */

import { describe, expect, it } from "vitest";
import {
  DUAL_GRID_NORTH_EAST,
  DUAL_GRID_SOUTH_EAST,
  normalizeBlobTransitionMask,
  resolveBlobTransitionMask,
  resolveDualGridTransitionMask,
  TRANSITION_EAST,
  TRANSITION_NORTH,
  TRANSITION_NORTH_EAST,
} from "./terrain-transition-resolver";

describe("blob transition resolver", () => {
  it("normalizes the 256 raw masks to the canonical 47 variants", () => {
    const variants = new Set<number>();
    for (let mask = 0; mask < 256; mask++) {
      variants.add(normalizeBlobTransitionMask(mask));
    }
    expect(variants.size).toBe(47);
  });

  it("retains a diagonal only when both adjacent cardinals connect", () => {
    expect(normalizeBlobTransitionMask(TRANSITION_NORTH_EAST)).toBe(0);
    expect(
      normalizeBlobTransitionMask(
        TRANSITION_NORTH | TRANSITION_EAST | TRANSITION_NORTH_EAST,
      ),
    ).toBe(TRANSITION_NORTH | TRANSITION_EAST | TRANSITION_NORTH_EAST);
  });

  it("classifies an eight-neighbor semantic sample", () => {
    const connected = new Set(["1,0", "2,1", "2,0"]);
    expect(
      resolveBlobTransitionMask(1, 1, (x, y) => connected.has(`${x},${y}`)),
    ).toBe(TRANSITION_NORTH | TRANSITION_EAST | TRANSITION_NORTH_EAST);
  });
});

describe("dual-grid transition resolver", () => {
  it("produces all sixteen four-corner states", () => {
    const variants = new Set<number>();
    for (let sourceMask = 0; sourceMask < 16; sourceMask++) {
      const samples = [
        [-1, -1],
        [0, -1],
        [0, 0],
        [-1, 0],
      ] as const;
      const connected = new Set(
        samples
          .filter((_, index) => sourceMask & (1 << index))
          .map(([x, y]) => `${x},${y}`),
      );
      variants.add(
        resolveDualGridTransitionMask(0, 0, (x, y) =>
          connected.has(`${x},${y}`),
        ),
      );
    }
    expect(variants.size).toBe(16);
  });

  it("maps semantic cells to their display-grid corners", () => {
    const connected = new Set(["0,-1", "0,0"]);
    expect(
      resolveDualGridTransitionMask(0, 0, (x, y) => connected.has(`${x},${y}`)),
    ).toBe(DUAL_GRID_NORTH_EAST | DUAL_GRID_SOUTH_EAST);
  });
});
