/** Tests for complete scalar-to-semantic tile classification. */

import { describe, expect, it } from "vitest";
import { TileType } from "../types";
import {
  createWorldPlaneFromTiles,
  deserializeWorldPlane,
  FixtureType,
  GroundType,
  resolveSemanticCell,
  semanticCellForTile,
  serializeWorldPlane,
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

  it("serializes and restores every authoritative layer", () => {
    const plane = createWorldPlaneFromTiles(
      [TileType.GRASS, TileType.TREE, TileType.HOLE, TileType.LIGHT],
      2,
      2,
      [0, 3, 8, 0],
    );
    plane.layers.elevation.set([-12, 0, 7, 32]);

    const serialized = serializeWorldPlane(plane);
    const restored = deserializeWorldPlane(serialized);

    expect(serializeWorldPlane(restored)).toEqual(serialized);
    restored.setTile(0, 0, TileType.DOOR_OPEN);
    expect(restored.getTile(0, 0)).toBe(TileType.DOOR_OPEN);
  });

  it("rejects serialized planes with missing or mis-sized layers", () => {
    expect(() =>
      deserializeWorldPlane({
        width: 2,
        height: 2,
        ground: [GroundType.FLOOR],
        structure: [],
        fixture: [],
        elevation: [],
        damage: [],
      }),
    ).toThrow("Invalid save: malformed world plane layers");
  });
});
