/** Tests for deterministic production world visual resolution. */

import { describe, expect, it } from "vitest";
import {
  createWorldPlaneFromTiles,
  GroundType,
} from "../../core/world-semantics";
import { TileType } from "../../types";
import {
  hashWorldVisualCoordinate,
  ResolvedBuildingPart,
  ResolvedCliffMagnitude,
  ResolvedFenceOrientation,
  WorldVisualState,
} from "./world-visual-resolver";

describe("WorldVisualState", () => {
  it("hashes coordinates deterministically with seed separation", () => {
    expect(hashWorldVisualCoordinate(12, -4, 9)).toBe(
      hashWorldVisualCoordinate(12, -4, 9),
    );
    expect(hashWorldVisualCoordinate(12, -4, 9)).not.toBe(
      hashWorldVisualCoordinate(12, -4, 10),
    );
  });

  it("refreshes no more than a 3x3 neighborhood", () => {
    const plane = createWorldPlaneFromTiles(
      new Array(25).fill(TileType.FLOOR),
      5,
      5,
    );
    const visuals = new WorldVisualState(plane);

    plane.setTile(2, 2, TileType.HOLE);
    const dirty = visuals.refreshNeighborhood(2, 2);

    expect(dirty).toHaveLength(9);
    expect(visuals.layers.holeMask[plane.indexFor(2, 1)]).not.toBe(0);
    expect(visuals.revision).toBe(1);
  });

  it("deduplicates wrapped dirty cells at small plane seams", () => {
    const plane = createWorldPlaneFromTiles(
      new Array(4).fill(TileType.GRASS),
      2,
      2,
    );
    const visuals = new WorldVisualState(plane, { wraps: true });
    expect(visuals.refreshNeighborhood(0, 0)).toHaveLength(4);
  });

  it("classifies water shores and bounded tall cliffs", () => {
    const plane = createWorldPlaneFromTiles(
      new Array(9).fill(TileType.FLOOR),
      3,
      3,
    );
    const center = plane.indexFor(1, 1);
    plane.layers.ground[center] = GroundType.WATER_DEEP;
    plane.layers.elevation[center] = 12;
    const visuals = new WorldVisualState(plane, {
      waterGroundIds: [GroundType.WATER_SHALLOW, GroundType.WATER_DEEP],
    });

    expect(visuals.layers.shoreMask[center]).toBe(0);
    expect(visuals.layers.cliffMagnitude[center]).toBe(
      ResolvedCliffMagnitude.TALL,
    );
  });

  it("repairs adjacent building and fence presentation after edits", () => {
    const plane = createWorldPlaneFromTiles(
      [
        TileType.FLOOR,
        TileType.BUILDING,
        TileType.FLOOR,
        TileType.FENCE,
        TileType.BUILDING,
        TileType.FENCE,
        TileType.FLOOR,
        TileType.FLOOR,
        TileType.FLOOR,
      ],
      3,
      3,
    );
    const visuals = plane.visuals;
    if (!visuals) throw new Error("Expected production visual state");

    expect(visuals.layers.buildingPart[plane.indexFor(1, 0)]).toBe(
      ResolvedBuildingPart.ROOF,
    );
    expect(visuals.layers.buildingPart[plane.indexFor(1, 1)]).toBe(
      ResolvedBuildingPart.FACADE,
    );
    expect(visuals.layers.fenceOrientation[plane.indexFor(0, 1)]).toBe(
      ResolvedFenceOrientation.HORIZONTAL,
    );

    plane.setTile(1, 1, TileType.FENCE);

    expect(visuals.layers.buildingPart[plane.indexFor(1, 0)]).toBe(
      ResolvedBuildingPart.FACADE,
    );
    expect(visuals.layers.fenceOrientation[plane.indexFor(0, 1)]).toBe(
      ResolvedFenceOrientation.HORIZONTAL,
    );
    expect(visuals.layers.fenceOrientation[plane.indexFor(1, 1)]).toBe(
      ResolvedFenceOrientation.HORIZONTAL,
    );

    plane.setTile(0, 0, TileType.FENCE);

    expect(visuals.layers.fenceOrientation[plane.indexFor(0, 1)]).toBe(
      ResolvedFenceOrientation.VERTICAL,
    );
  });
});
