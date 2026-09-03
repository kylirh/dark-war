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
const STRUCTURE_NONE = 0;
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
});
