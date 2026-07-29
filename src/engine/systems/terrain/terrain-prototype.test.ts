/** Tests for the deterministic Milestone 1 terrain fixture. */

import { describe, expect, it } from "vitest";
import { TileType } from "../../types";
import {
  applyTerrainPrototypeElevationEdit,
  createTerrainPrototypePlane,
  PrototypeCliffVisual,
  PrototypeGround,
  PrototypeStructure,
  setTerrainPrototypeTransitionMode,
  TERRAIN_LOWER_FIXTURE,
  TERRAIN_PROTOTYPE_HEIGHT,
  TERRAIN_PROTOTYPE_WIDTH,
  TerrainPrototypeTransitionMode,
  terrainDirtyNeighborhood,
} from "./terrain-prototype";

describe("createTerrainPrototypePlane", () => {
  it("creates aligned structure-of-arrays layers", () => {
    const plane = createTerrainPrototypePlane();
    const cellCount = TERRAIN_PROTOTYPE_WIDTH * TERRAIN_PROTOTYPE_HEIGHT;

    expect(plane.width).toBe(40);
    expect(plane.height).toBe(30);
    expect(plane.ground).toBeInstanceOf(Uint16Array);
    expect(plane.structure).toBeInstanceOf(Uint16Array);
    expect(plane.elevation).toBeInstanceOf(Int16Array);
    expect(plane.ground).toHaveLength(cellCount);
    expect(plane.structure).toHaveLength(cellCount);
    expect(plane.elevation).toHaveLength(cellCount);
    expect(plane.world.layers.ground).toBe(plane.ground);
    expect(plane.world.layers.structure).toBe(plane.structure);
    expect(plane.world.layers.elevation).toBe(plane.elevation);
    expect(plane.visuals.shoreMask).toHaveLength(cellCount);
  });

  it("switches shoreline comparison families deterministically", () => {
    const plane = createTerrainPrototypePlane();
    const waterIndex = 20 + 3 * plane.width;
    const blobMask = plane.visuals.shoreMask[waterIndex];

    expect(plane.transitionMode).toBe(TerrainPrototypeTransitionMode.BLOB_47);
    expect(
      setTerrainPrototypeTransitionMode(
        plane,
        TerrainPrototypeTransitionMode.DUAL_GRID,
      ),
    ).toBe(plane.width * plane.height);
    expect(plane.transitionMode).toBe(TerrainPrototypeTransitionMode.DUAL_GRID);
    expect(plane.visuals.shoreMask[waterIndex]).not.toBe(blobMask);
    expect(
      setTerrainPrototypeTransitionMode(
        plane,
        TerrainPrototypeTransitionMode.DUAL_GRID,
      ),
    ).toBe(0);
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
    expect(plane.world.getTile(20, 3)).toBe(TileType.WALL);
    expect(plane.structure[indexFor(20, 6)]).toBe(
      PrototypeStructure.BRIDGE_HORIZONTAL,
    );
    expect(plane.world.getTile(20, 6)).toBe(TileType.FLOOR);
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

describe("terrain prototype edits", () => {
  it("clips dirty neighborhoods at plane boundaries", () => {
    expect(terrainDirtyNeighborhood(10, 10, 40, 30)).toHaveLength(9);
    expect(terrainDirtyNeighborhood(0, 0, 40, 30)).toEqual([0, 1, 40, 41]);
  });

  it("updates one semantic cell and only its 3x3 visual dependency area", () => {
    const plane = createTerrainPrototypePlane();
    const [x, y] = TERRAIN_LOWER_FIXTURE;
    const editedIndex = x + y * plane.width;
    const untouchedIndex = 1 + plane.width;
    const untouchedVisual = {
      ground: plane.visuals.ground[untouchedIndex],
      cliff: plane.visuals.cliff[untouchedIndex],
      edge: plane.visuals.cliffEdgeMask[untouchedIndex],
    };

    const result = applyTerrainPrototypeElevationEdit(plane, x, y, -1);

    expect(result).not.toBeNull();
    expect(result?.editedCellIndex).toBe(editedIndex);
    expect(result?.previousElevation).toBe(8);
    expect(result?.nextElevation).toBe(7);
    expect(result?.dirtyCellIndices).toHaveLength(9);
    expect(plane.editFeedback.dirtyCellIndices.size).toBe(9);
    expect(plane.editFeedback.editedCellIndex).toBe(editedIndex);
    expect(plane.editFeedback.revision).toBe(1);
    expect(plane.visuals.cliff[editedIndex]).toBe(PrototypeCliffVisual.STEP);
    expect(plane.world.getTile(x, y)).toBe(TileType.WALL);
    expect({
      ground: plane.visuals.ground[untouchedIndex],
      cliff: plane.visuals.cliff[untouchedIndex],
      edge: plane.visuals.cliffEdgeMask[untouchedIndex],
    }).toEqual(untouchedVisual);
  });

  it("supports repeated signed edits without expanding resolver work", () => {
    const plane = createTerrainPrototypePlane();
    const [x, y] = TERRAIN_LOWER_FIXTURE;

    const first = applyTerrainPrototypeElevationEdit(plane, x, y, -1);
    const second = applyTerrainPrototypeElevationEdit(plane, x, y, -5);

    expect(first?.dirtyCellIndices).toHaveLength(9);
    expect(second?.dirtyCellIndices).toHaveLength(9);
    expect(second?.nextElevation).toBe(2);
    expect(plane.editFeedback.revision).toBe(2);
  });
});
