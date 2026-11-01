import { describe, expect, it } from "vitest";
import { WorldPlane, createWorldPlaneLayers } from "./world-plane";
import { TileType } from "../types";
import { setStateTile } from "../utils/state-tiles";

describe("differential check", () => {
  it("should include modified visual indices from WorldPlane.setTile into state.changedTiles", () => {
    const layers = createWorldPlaneLayers(10, 10);
    let called = false;

    const plane = new WorldPlane(
      10,
      10,
      layers,
      (l, idx) => ({
        tile: TileType.FLOOR,
        passable: true,
        opaque: false,
        destructible: false,
      }),
      (l, idx, tile) => {
        called = true;
      },
    );

    const mockVisualState = {
      refreshNeighborhood: (x: number, y: number) => {
        return [plane.indexFor(x, y), plane.indexFor(x + 1, y)];
      },
    } as any;
    plane.attachVisualState(mockVisualState);

    const changedTiles = new Set<number>();
    const mockState = {
      mapWidth: 10,
      mapHeight: 10,
      tiles: plane,
      changedTiles: changedTiles,
    } as any;

    setStateTile(mockState, 5, 5, TileType.WALL);
    expect(changedTiles.has(plane.indexFor(5, 5))).toBe(true);
    expect(changedTiles.has(plane.indexFor(6, 5))).toBe(true);
  });
});
