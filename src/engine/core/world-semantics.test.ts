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

  it("blocks movement through static water without blocking sight", () => {
    for (const ground of [
      GroundType.WATER_SHALLOW,
      GroundType.WATER_DEEP,
      GroundType.WATER_RIVER,
    ]) {
      const semantics = resolveSemanticCell({
        ground,
        structure: StructureType.NONE,
        fixture: FixtureType.NONE,
      });
      expect(semantics.passable).toBe(false);
      expect(semantics.opaque).toBe(false);
    }
  });

  it("keeps workshop collision footprints invisible to sight", () => {
    const semantics = resolveSemanticCell({
      ground: GroundType.GRASS,
      structure: StructureType.WORKSHOP_FOOTPRINT,
      fixture: FixtureType.NONE,
    });
    expect(semantics.passable).toBe(false);
    expect(semantics.opaque).toBe(false);
  });

  it("allows level terrain, blocks cliffs, and crosses one-step stairs", () => {
    const plane = createWorldPlaneFromTiles(
      [TileType.FLOOR, TileType.FLOOR, TileType.FLOOR],
      3,
      1,
    );
    plane.editCell(1, 0, { elevation: 1 });
    plane.editCell(2, 0, { elevation: 2, fixture: FixtureType.STAIRS });

    expect(plane.canTraverse(0, 0, 1, 0)).toBe(false);
    expect(plane.canTraverse(1, 0, 2, 0)).toBe(true);
    expect(plane.canTraverse(2, 0, 1, 0)).toBe(true);
  });

  it("edits signed elevation with bounded visual invalidation", () => {
    const plane = createWorldPlaneFromTiles(
      new Array(25).fill(TileType.GRASS),
      5,
      5,
    );
    const dirty = plane.editCell(2, 2, { elevation: -40000 });

    expect(plane.layers.elevation[plane.indexFor(2, 2)]).toBe(-32768);
    expect(dirty).toHaveLength(9);
    expect(plane.visuals?.lastDirtyIndices).toEqual(dirty);
  });

  it("converts generated layouts into writable authoritative planes", () => {
    const source = [
      TileType.GRASS,
      TileType.TREE,
      TileType.SIDEWALK,
      TileType.LIGHT,
    ];
    const plane = createWorldPlaneFromTiles(source, 2, 2, [0, 12, 0, 4]);

    expect([
      plane.getTile(0, 0),
      plane.getTile(1, 0),
      plane.getTile(0, 1),
      plane.getTile(1, 1),
    ]).toEqual(source);
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
