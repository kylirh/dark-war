/**
 * Tests for cardinal autotile mask construction.
 */

import { describe, expect, it } from "vitest";
import {
  AUTOTILE_EAST,
  AUTOTILE_NORTH,
  AUTOTILE_SOUTH,
  AUTOTILE_WEST,
  cardinalAutotileMask,
} from "./autotile";

describe("cardinalAutotileMask", () => {
  it("sets every cardinal direction independently", () => {
    const neighbors = new Set(["4,3", "5,4", "4,5", "3,4"]);
    const mask = cardinalAutotileMask(4, 4, (x, y) =>
      neighbors.has(`${x},${y}`),
    );

    expect(mask).toBe(
      AUTOTILE_NORTH | AUTOTILE_EAST | AUTOTILE_SOUTH | AUTOTILE_WEST,
    );
  });

  it("returns zero for an isolated tile", () => {
    expect(cardinalAutotileMask(2, 2, () => false)).toBe(0);
  });

  it("does not connect diagonal neighbors", () => {
    const neighbors = new Set(["1,1", "3,1", "1,3", "3,3"]);
    const mask = cardinalAutotileMask(2, 2, (x, y) =>
      neighbors.has(`${x},${y}`),
    );

    expect(mask).toBe(0);
  });
});
