/**
 * Tests for autotile sprite coordinate selection.
 */

import { describe, expect, it } from "vitest";
import { ItemType, TileType } from "../types";
import {
  holeAutotileCoordinate,
  PLAYER_IDLE_FRAMES,
  PLAYER_WALK_FRAMES,
  SPRITE_COORDS,
  wallAutotileCoordinate,
} from "./sprites";

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

  it("maps each horizontal direction to its stable directional drawing", () => {
    expect(PLAYER_WALK_FRAMES.left).toEqual([SPRITE_COORDS.player_walk_side_2]);
    expect(PLAYER_WALK_FRAMES.right).toEqual([
      SPRITE_COORDS.player_walk_side_1,
    ]);
    expect(PLAYER_IDLE_FRAMES.left).toEqual(SPRITE_COORDS.player_walk_side_2);
    expect(PLAYER_IDLE_FRAMES.right).toEqual(SPRITE_COORDS.player_walk_side_1);
  });

  it("provides an atlas frame for the pickaxe", () => {
    expect(SPRITE_COORDS[ItemType.PICKAXE]).toEqual({ x: 11, y: 6 });
  });
});
