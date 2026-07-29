/** Tests for complete scalar-to-semantic tile classification. */

import { describe, expect, it } from "vitest";
import { TileType } from "../types";
import {
  createWorldPlaneFromTiles,
  FixtureType,
  GroundType,
  resolveSemanticCell,
  semanticCellForTile,
  StructureType,
} from "./world-semantics";

describe("world semantic vocabulary", () => {
  it("classifies every current TileType", () => {
    for (const value of Object.values(TileType)) {
      if (typeof value !== "number") continue;
      expect(semanticCellForTile(value)).toBeDefined();
    }
  });

  it("round-trips current tile behavior through semantic layers", () => {
    for (const value of Object.values(TileType)) {
      if (typeof value !== "number") continue;
      expect(resolveSemanticCell(semanticCellForTile(value)).tile).toBe(value);
    }
  });

  it("preserves meaningful ground beneath structures and fixtures", () => {
    expect(semanticCellForTile(TileType.TREE)).toEqual({
      ground: GroundType.GRASS,
      structure: StructureType.TREE,
      fixture: FixtureType.NONE,
    });
    expect(semanticCellForTile(TileType.LIGHT)).toEqual({
      ground: GroundType.SIDEWALK,
      structure: StructureType.NONE,
      fixture: FixtureType.LIGHT,
    });
  });

  it("composes static water and bridges without changing water ground", () => {
    const cell = {
      ground: GroundType.WATER_DEEP,
      structure: StructureType.BRIDGE_HORIZONTAL,
      fixture: FixtureType.NONE,
    };
    const semantics = resolveSemanticCell(cell);
    expect(semantics.tile).toBe(TileType.FLOOR);
    expect(semantics.passable).toBe(true);
    expect(cell.ground).toBe(GroundType.WATER_DEEP);
  });

  it("converts generated layouts into writable authoritative planes", () => {
    const source = [
      TileType.GRASS,
      TileType.TREE,
      TileType.SIDEWALK,
      TileType.LIGHT,
    ];
    const plane = createWorldPlaneFromTiles(source, 2, 2, [0, 12, 0, 4]);

    expect(plane.legacyTiles).toEqual(source);
    expect(plane.layers.damage).toEqual(new Uint8Array([0, 12, 0, 4]));
    plane.setTile(0, 0, TileType.DOOR_LOCKED);
    expect(plane.layers.ground[0]).toBe(GroundType.FLOOR);
    expect(plane.layers.structure[0]).toBe(StructureType.DOOR_LOCKED);
    expect(plane.getTile(0, 0)).toBe(TileType.DOOR_LOCKED);
  });

  it("rejects malformed generated layouts", () => {
    expect(() => createWorldPlaneFromTiles([TileType.FLOOR], 2, 2)).toThrow(
      "Generated tile layout must match width × height",
    );
  });
});
