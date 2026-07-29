/** Tests for canonical runtime terrain mutation. */

import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { StructureType } from "../core/world-semantics";
import { TileType } from "../types";
import {
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
    expect(state.map[index]).toBe(TileType.DOOR_LOCKED);
    expect(state.worldPlane!.layers.structure[index]).toBe(
      StructureType.DOOR_LOCKED,
    );
    expect(state.changedTiles).toContain(index);

    setStateDamageAtIndex(state, index, 7);
    expect(state.wallDamage[index]).toBe(7);
    expect(state.worldPlane!.layers.damage[index]).toBe(7);
  });

  it("continues to mutate flat dungeon levels through the same API", () => {
    const game = new Game();
    game.reset(1);
    const state = game.getState();
    const index = state.player.gridX + state.player.gridY * state.mapWidth;

    expect(state.worldPlane).toBeUndefined();
    expect(setStateTileAtIndex(state, index, TileType.HOLOWALL)).toBe(true);
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      TileType.HOLOWALL,
    );
    expect(state.map[index]).toBe(TileType.HOLOWALL);
  });
});
