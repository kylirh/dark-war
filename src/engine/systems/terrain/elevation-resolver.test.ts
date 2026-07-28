/**
 * Tests for elevation-neighborhood classification and bounded cliff magnitude.
 */

import { describe, expect, it } from "vitest";
import {
  cliffMagnitudeForDrop,
  ELEVATION_EAST,
  ELEVATION_NORTH,
  ELEVATION_NORTH_EAST,
  ELEVATION_SOUTH,
  ELEVATION_SOUTH_WEST,
  resolveElevationVisualContext,
} from "./elevation-resolver";

function elevationGrid(
  rows: readonly (readonly number[])[],
): (x: number, y: number) => number {
  return (x: number, y: number): number => rows[y]?.[x] ?? rows[1]?.[1] ?? 0;
}

describe("resolveElevationVisualContext", () => {
  it("reports no topology on a flat terrace", () => {
    const context = resolveElevationVisualContext(
      1,
      1,
      elevationGrid([
        [5, 5, 5],
        [5, 5, 5],
        [5, 5, 5],
      ]),
    );

    expect(context).toEqual({
      elevation: 5,
      lowerNeighborMask: 0,
      higherNeighborMask: 0,
      maximumDrop: 0,
      maximumRise: 0,
    });
  });

  it("classifies inner and outer elevation relationships independently", () => {
    const context = resolveElevationVisualContext(
      1,
      1,
      elevationGrid([
        [3, 2, 2],
        [3, 3, 5],
        [1, 1, 3],
      ]),
    );

    expect(context.lowerNeighborMask).toBe(
      ELEVATION_NORTH |
        ELEVATION_NORTH_EAST |
        ELEVATION_SOUTH |
        ELEVATION_SOUTH_WEST,
    );
    expect(context.higherNeighborMask).toBe(ELEVATION_EAST);
    expect(context.maximumDrop).toBe(2);
    expect(context.maximumRise).toBe(2);
  });

  it("supports signed elevations and large logical drops", () => {
    const context = resolveElevationVisualContext(
      1,
      1,
      elevationGrid([
        [-4, -4, -4],
        [-4, 12, -4],
        [-4, -4, -4],
      ]),
    );

    expect(context.maximumDrop).toBe(16);
    expect(context.lowerNeighborMask).toBe(0xff);
    expect(context.higherNeighborMask).toBe(0);
  });
});

describe("cliffMagnitudeForDrop", () => {
  it("maps arbitrary drops to constant-count visual families", () => {
    expect(cliffMagnitudeForDrop(-2)).toBe("none");
    expect(cliffMagnitudeForDrop(0)).toBe("none");
    expect(cliffMagnitudeForDrop(1)).toBe("step");
    expect(cliffMagnitudeForDrop(2)).toBe("tall");
    expect(cliffMagnitudeForDrop(30_000)).toBe("tall");
  });
});
