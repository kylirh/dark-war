/** Tests for compiled semantic prefab validation, transforms, and stamping. */

import { describe, expect, it } from "vitest";
import { TileType } from "../types";
import { createWorldPlaneFromTiles, GroundType } from "./world-semantics";
import {
  prefabKeys,
  semanticPrefab,
  stampSemanticPrefab,
} from "./semantic-prefab";

function floorPlane(width = 32, height = 24) {
  return createWorldPlaneFromTiles(
    new Array(width * height).fill(TileType.FLOOR),
    width,
    height,
  );
}

describe("semantic prefabs", () => {
  it("loads the Tiled-authored prefab and preserves its markers", () => {
    expect(prefabKeys()).toContain("cave.rest-stop");
    expect(prefabKeys()).toContain("settlement.workshop-garden");
    const prefab = semanticPrefab("cave.rest-stop");
    expect(prefab.markers.map((marker) => marker.kind)).toEqual([
      "socket",
      "socket",
      "spawn",
      "portal",
      "require",
    ]);
  });

  it("returns all sorted prefab keys", () => {
    const keys = prefabKeys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain("cave.rest-stop");
    expect(keys).toEqual([...keys].sort()); // Check that it is sorted
  });

  it("stamps semantics and repairs derived neighborhoods", () => {
    const plane = floorPlane();
    const result = stampSemanticPrefab(
      plane,
      semanticPrefab("cave.rest-stop"),
      5,
      6,
    );
    expect(plane.layers.ground[5 + 6 * plane.width]).toBe(GroundType.STONE);
    expect(result.changedIndices.length).toBeGreaterThan(120);
    expect(result.markers.some((marker) => marker.kind === "portal")).toBe(
      true,
    );
    expect(result.markers.some((marker) => marker.kind === "require")).toBe(
      false,
    );
  });

  it("rotates cells and marker coordinates deterministically", () => {
    const plane = floorPlane();
    const result = stampSemanticPrefab(
      plane,
      semanticPrefab("cave.rest-stop"),
      2,
      3,
      "rotate90",
    );
    expect([result.width, result.height]).toEqual([10, 12]);
    expect(result.markers.find((marker) => marker.name === "west")).toEqual(
      expect.objectContaining({
        worldX: 6,
        worldY: 3,
        properties: expect.objectContaining({ "darkwar.direction": "north" }),
      }),
    );
  });

  it("rejects bounds and unmet surroundings before writing", () => {
    const prefab = semanticPrefab("cave.rest-stop");
    expect(() => stampSemanticPrefab(floorPlane(8, 8), prefab, 0, 0)).toThrow(
      /out of world bounds/,
    );
    const plane = floorPlane();
    plane.editCell(6, 5, { ground: GroundType.GRASS });
    expect(() => stampSemanticPrefab(plane, prefab, 0, 0)).toThrow(
      /requires ground\.floor/,
    );
  });
});
