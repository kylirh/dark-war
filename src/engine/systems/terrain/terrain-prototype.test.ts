/** Tests for the deterministic Milestone 1 terrain fixture. */

import { describe, expect, it } from "vitest";
import { TileType } from "../../types";
import {
  createTerrainPrototypePlane,
  PrototypeGround,
  PrototypeStructure,
  TERRAIN_PROTOTYPE_HEIGHT,
  TERRAIN_PROTOTYPE_WIDTH,
} from "./terrain-prototype";

describe("createTerrainPrototypePlane", () => {
  it("creates aligned structure-of-arrays layers", () => {
    const plane = createTerrainPrototypePlane();
    const cellCount = TERRAIN_PROTOTYPE_WIDTH * TERRAIN_PROTOTYPE_HEIGHT;

    expect(plane.width).toBe(40);
    expect(plane.height).toBe(30);
    expect(plane.ground).toBeInstanceOf(Uint8Array);
    expect(plane.structure).toBeInstanceOf(Uint8Array);
    expect(plane.elevation).toBeInstanceOf(Int16Array);
    expect(plane.ground).toHaveLength(cellCount);
    expect(plane.structure).toHaveLength(cellCount);
    expect(plane.elevation).toHaveLength(cellCount);
    expect(plane.collisionMap).toHaveLength(cellCount);
  });

  it("contains the required signed elevations and constant-cost tall drop", () => {
    const plane = createTerrainPrototypePlane();
    const values = [...plane.elevation];

    expect(Math.min(...values)).toBe(-4);
    expect(Math.max(...values)).toBe(12);
    expect(new Set(values)).toEqual(new Set([-4, 0, 2, 5, 8, 12]));
  });

  it("keeps water static and makes only the bridge traversable", () => {
    const plane = createTerrainPrototypePlane();
    const indexFor = (x: number, y: number): number => x + y * plane.width;

    expect(plane.ground[indexFor(20, 3)]).toBe(PrototypeGround.WATER_DEEP);
    expect(plane.collisionMap[indexFor(20, 3)]).toBe(TileType.WALL);
    expect(plane.structure[indexFor(20, 6)]).toBe(
      PrototypeStructure.BRIDGE_HORIZONTAL,
    );
    expect(plane.collisionMap[indexFor(20, 6)]).toBe(TileType.FLOOR);
  });

  it("contains the authored rebuilding and portal landmarks", () => {
    const plane = createTerrainPrototypePlane();
    const structures = [...plane.structure];

    expect(structures).toContain(PrototypeStructure.WORKSHOP);
    expect(structures).toContain(PrototypeStructure.GARDEN);
    expect(structures).toContain(PrototypeStructure.CAVE_MOUTH);
    expect(structures).toContain(PrototypeStructure.FLOWERS);
    expect(structures).toContain(PrototypeStructure.TREE);
  });
});
