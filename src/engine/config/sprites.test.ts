/**
 * Tests for autotile sprite coordinate selection.
 */

import { describe, expect, it } from "vitest";
import { TileType } from "../types";
import { holeAutotileCoordinate, wallAutotileCoordinate } from "./sprites";

describe("autotile sprite coordinates", () => {
  it("packs all concrete wall masks into the concrete atlas rows", () => {
    expect(wallAutotileCoordinate(TileType.WALL, 0)).toEqual({
      x: 0,
      y: 18,
    });
    expect(wallAutotileCoordinate(TileType.WALL, 15)).toEqual({
      x: 7,
      y: 20,
    });
  });

  it("keeps damage and material families in separate atlas rows", () => {
    expect(wallAutotileCoordinate("wall_damaged_2", 9)).toEqual({
      x: 1,
      y: 28,
    });
    expect(wallAutotileCoordinate("wall_wood_damaged_1", 6)).toEqual({
      x: 6,
      y: 34,
    });
  });

  it("maps every hole mask across one atlas row", () => {
    expect(holeAutotileCoordinate(0)).toEqual({ x: 0, y: 42 });
    expect(holeAutotileCoordinate(15)).toEqual({ x: 15, y: 42 });
  });
});
