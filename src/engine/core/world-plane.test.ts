/** Tests for authoritative layered WorldPlane storage. */

import { describe, expect, it } from "vitest";
import { TileType } from "../types";
import {
  createWorldPlaneLayers,
  WorldCellResolver,
  WorldPlane,
} from "./world-plane";

const GROUND_GRASS = 1;
const GROUND_WATER = 2;
const STRUCTURE_TREE = 1;
const STRUCTURE_BRIDGE = 2;

const resolveTestCell: WorldCellResolver = (layers, index) => {
  const structure = layers.structure[index];
  const water = layers.ground[index] === GROUND_WATER;
  const bridge = structure === STRUCTURE_BRIDGE;
  const blocked = (water || structure === STRUCTURE_TREE) && !bridge;
  return {
    tile: blocked ? TileType.WALL : TileType.FLOOR,
    passable: !blocked,
    opaque: structure === STRUCTURE_TREE,
    destructible: structure === STRUCTURE_TREE,
  };
};

describe("createWorldPlaneLayers", () => {
  it("allocates standard map dimensions", () => {
    const layers = createWorldPlaneLayers(10, 10);
    expect(layers.ground).toBeInstanceOf(Uint16Array);
    expect(layers.structure).toBeInstanceOf(Uint16Array);
    expect(layers.fixture).toBeInstanceOf(Uint16Array);
    expect(layers.elevation).toBeInstanceOf(Int16Array);
    expect(layers.damage).toBeInstanceOf(Uint8Array);
    for (const layer of Object.values(layers)) expect(layer).toHaveLength(100);
  });

  it("handles zero dimensions", () => {
    const layers = createWorldPlaneLayers(0, 5);
    for (const layer of Object.values(layers)) expect(layer).toHaveLength(0);
  });

  it("throws RangeError on negative dimensions", () => {
    expect(() => createWorldPlaneLayers(-1, 5)).toThrowError(RangeError);
  });
});

describe("WorldPlane", () => {
  it("allocates aligned typed-array layers", () => {
    const layers = createWorldPlaneLayers(5, 4);
    expect(layers.ground).toBeInstanceOf(Uint16Array);
    expect(layers.structure).toBeInstanceOf(Uint16Array);
    expect(layers.fixture).toBeInstanceOf(Uint16Array);
    expect(layers.elevation).toBeInstanceOf(Int16Array);
    expect(layers.damage).toBeInstanceOf(Uint8Array);
    for (const layer of Object.values(layers)) expect(layer).toHaveLength(20);
  });

  it("composes ground and structure semantics without losing either layer", () => {
    const layers = createWorldPlaneLayers(3, 2);
    layers.ground.fill(GROUND_GRASS);
    layers.ground[1] = GROUND_WATER;
    layers.structure[1] = STRUCTURE_BRIDGE;
    layers.structure[2] = STRUCTURE_TREE;
    const plane = new WorldPlane(3, 2, layers, resolveTestCell);

    expect(plane.passable(1, 0)).toBe(true);
    expect(plane.getTile(1, 0)).toBe(TileType.FLOOR);
    expect(layers.ground[1]).toBe(GROUND_WATER);
    expect(layers.structure[1]).toBe(STRUCTURE_BRIDGE);
    expect(plane.passable(2, 0)).toBe(false);
    expect(plane.opaque(2, 0)).toBe(true);
    expect(plane.destructible(2, 0)).toBe(true);
  });

  it("refreshes only explicitly dirtied resolved presentation cells", () => {
    const layers = createWorldPlaneLayers(3, 3);
    layers.ground.fill(GROUND_GRASS);
    const plane = new WorldPlane(3, 3, layers, resolveTestCell);
    const center = plane.indexFor(1, 1);

    layers.structure[center] = STRUCTURE_TREE;
    expect(plane.getTile(1, 1)).toBe(TileType.FLOOR);
    plane.refreshResolvedTile(center);
    expect(plane.getTile(1, 1)).toBe(TileType.WALL);
    expect(plane.getTile(0, 0)).toBe(TileType.FLOOR);
  });

  it("answers hot semantic queries from caches without rerunning the resolver", () => {
    const layers = createWorldPlaneLayers(3, 1);
    layers.ground.fill(GROUND_GRASS);
    let resolverCalls = 0;
    const resolver: WorldCellResolver = (source, index) => {
      resolverCalls += 1;
      return resolveTestCell(source, index, index, 0);
    };
    const plane = new WorldPlane(3, 1, layers, resolver);
    expect(resolverCalls).toBe(3);

    expect(plane.getTile(1, 0)).toBe(TileType.FLOOR);
    expect(plane.passable(1, 0)).toBe(true);
    expect(plane.opaque(1, 0)).toBe(false);
    expect(plane.destructible(1, 0)).toBe(false);
    expect(plane.canTraverse(0, 0, 1, 0)).toBe(true);
    expect(resolverCalls).toBe(3);

    layers.structure[1] = STRUCTURE_TREE;
    plane.refreshResolvedTile(1);
    expect(resolverCalls).toBe(4);
    expect(plane.passable(1, 0)).toBe(false);
    expect(plane.opaque(1, 0)).toBe(true);
    expect(plane.canTraverse(0, 0, 1, 0)).toBe(false);
    expect(resolverCalls).toBe(4);
  });

  it("rejects misaligned layers", () => {
    const layers = createWorldPlaneLayers(2, 2);
    const invalidLayers = { ...layers, damage: new Uint8Array(3) };
    expect(() => new WorldPlane(2, 2, invalidLayers, resolveTestCell)).toThrow(
      "WorldPlane layers must match width × height",
    );
  });

  it("throws when setTile is called without a writeCell function", () => {
    const layers = createWorldPlaneLayers(2, 2);
    const plane = new WorldPlane(2, 2, layers, resolveTestCell);

    expect(() => plane.setTile(0, 0, TileType.FLOOR)).toThrow(
      "This WorldPlane does not support scalar tile writes",
    );
  });

  it("ignores setTile calls out of bounds", () => {
    const layers = createWorldPlaneLayers(2, 2);
    const writeCell = () => {};
    const plane = new WorldPlane(2, 2, layers, resolveTestCell, writeCell);

    // Should not throw
    plane.setTile(-1, 0, TileType.FLOOR);
  });

  it("uses default elevation traversal check when resolveTraversal is omitted", () => {
    const layers = createWorldPlaneLayers(3, 1);
    layers.ground.fill(GROUND_GRASS);
    const plane = new WorldPlane(3, 1, layers, resolveTestCell);

    // Both at 0 elevation
    expect(plane.canTraverse(0, 0, 1, 0)).toBe(true);

    // Change elevation
    layers.elevation[1] = 5;
    expect(plane.canTraverse(0, 0, 1, 0)).toBe(false);
  });

  it("can traverse across the wrapped boundary when wraps is true", () => {
    const layers = createWorldPlaneLayers(3, 3);
    layers.ground.fill(GROUND_GRASS);
    const plane = new WorldPlane(3, 3, layers, resolveTestCell);

    // Normal in-bounds traversal
    expect(plane.canTraverse(0, 0, 1, 0)).toBe(true);

    // Wrapped out-of-bounds traversal left
    expect(plane.canTraverse(0, 0, -1, 0, true)).toBe(true);
    // Wrapped out-of-bounds traversal right
    expect(plane.canTraverse(2, 0, 3, 0, true)).toBe(true);
    // Wrapped out-of-bounds traversal up
    expect(plane.canTraverse(0, 0, 0, -1, true)).toBe(true);
    // Wrapped out-of-bounds traversal down
    expect(plane.canTraverse(0, 2, 0, 3, true)).toBe(true);

    // Rejects if the wrapped cell is impassable
    layers.structure[plane.indexFor(2, 0)] = STRUCTURE_TREE;
    plane.refreshResolvedTile(plane.indexFor(2, 0));
    expect(plane.canTraverse(0, 0, -1, 0, true)).toBe(false);

    // Rejects wrapping if wraps is false
    expect(plane.canTraverse(0, 0, -1, 0, false)).toBe(false);
  });

  it("applies edits across various layers and caps values", () => {
    const layers = createWorldPlaneLayers(2, 2);
    layers.ground.fill(GROUND_GRASS);
    const plane = new WorldPlane(2, 2, layers, resolveTestCell);

    const changes = plane.editCell(0, 0, {
      ground: GROUND_WATER,
      structure: STRUCTURE_BRIDGE,
      fixture: 42,
      elevation: 40000, // Caps at 32767
      damage: 300, // Caps at 255
    });

    expect(changes).toEqual([0]);
    const index = plane.indexFor(0, 0);

    expect(layers.ground[index]).toBe(GROUND_WATER);
    expect(layers.structure[index]).toBe(STRUCTURE_BRIDGE);
    expect(layers.fixture[index]).toBe(42);
    expect(layers.elevation[index]).toBe(32767);
    expect(layers.damage[index]).toBe(255);
  });
});
