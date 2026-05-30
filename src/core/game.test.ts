import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import { EntityKind } from "../types";
import { RNG } from "../utils/rng";

describe("Game serialize/deserialize round-trip", () => {
  beforeEach(() => RNG.reseed(424242));

  it("restores depth, map, player, and entities", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1); // a dungeon level

    const before = game.getState();
    const serialized = game.serialize();

    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);
    const after = restored.getState();

    expect(after.depth).toBe(before.depth);
    expect(after.map).toEqual(before.map);
    expect(after.mapWidth).toBe(before.mapWidth);
    expect(after.mapHeight).toBe(before.mapHeight);
    expect(after.player.gridX).toBe(before.player.gridX);
    expect(after.player.gridY).toBe(before.player.gridY);
    expect(after.entities.length).toBe(before.entities.length);
  });

  it("rebuilds the tile source over the restored map", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const state = restored.getState();
    // tiles must reflect the restored map, not a stale array.
    expect(state.tiles.width).toBe(state.mapWidth);
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      state.map[state.player.gridX + state.player.gridY * state.mapWidth],
    );
  });

  it("keeps the player present in the entities list", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const players = state.entities.filter((e) => e.kind === EntityKind.PLAYER);
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe(state.player.id);
  });
});

describe("Game multiplayer player management", () => {
  beforeEach(() => RNG.reseed(7));

  it("adds and removes network players", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const startCount = game.getState().players.length;

    game.addNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(true);
    expect(game.getState().players.length).toBe(startCount + 1);

    game.removeNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(false);
    expect(game.getState().entities.some((e) => e.id === "remote-1")).toBe(false);
  });
});
