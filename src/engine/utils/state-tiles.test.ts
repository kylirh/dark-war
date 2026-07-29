/** Tests for canonical runtime terrain mutation. */

import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { StructureType } from "../core/world-semantics";
import { TileType } from "../types";
import {
  getStateDamageAtIndex,
  setStateDamageAtIndex,
  setStateTile,
  setStateTileAtIndex,
} from "./state-tiles";

describe("state tile mutations", () => {
  it("keeps outside semantic layers and scalar projection synchronized", () => {
    const game = new Game();
    game.reset(0);
    const state = game.getState();
    const x = 12;
    const y = 58;
    const index = x + y * state.mapWidth;

    expect(state.worldPlane).toBeDefined();
    expect(setStateTile(state, x, y, TileType.DOOR_LOCKED)).toBe(true);
    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_LOCKED);
    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_LOCKED);
    expect(state.worldPlane.layers.structure[index]).toBe(
      StructureType.DOOR_LOCKED,
    );
    expect(state.changedTiles).toContain(index);

    state.changedTiles?.clear();
    setStateDamageAtIndex(state, index, 7);
    expect(getStateDamageAtIndex(state, index)).toBe(7);
    expect(state.worldPlane.layers.damage[index]).toBe(7);
    expect(state.changedTiles).toEqual(new Set());
  });

  it("mutates authoritative dungeon layers through the same API", () => {
    const game = new Game();
    game.reset(1);
    const state = game.getState();
    const index = state.player.gridX + state.player.gridY * state.mapWidth;

    expect(state.worldPlane).toBeDefined();
    expect(setStateTileAtIndex(state, index, TileType.HOLOWALL)).toBe(true);
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      TileType.HOLOWALL,
    );
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      TileType.HOLOWALL,
    );
    expect(state.worldPlane.layers.structure[index]).toBe(
      StructureType.HOLOWALL,
    );
  });

  it("refreshes only the bounded resolved-visual neighborhood", () => {
    const game = new Game();
    game.reset(1);
    const state = game.getState();
    const visuals = state.worldPlane.visuals;
    expect(visuals).toBeDefined();
    const beforeRevision = visuals!.revision;
    const x = state.player.gridX + 1;
    const y = state.player.gridY;

    setStateTile(state, x, y, TileType.HOLE);

    expect(visuals!.revision).toBe(beforeRevision + 1);
    expect(visuals!.lastDirtyIndices.length).toBeLessThanOrEqual(9);
    expect(visuals!.lastDirtyIndices).toContain(x + y * state.mapWidth);
    expect(visuals!.layers.holeMask[x + (y - 1) * state.mapWidth]).not.toBe(0);
  });
});
