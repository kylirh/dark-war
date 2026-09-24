import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { resolveCommand } from "./commands";

describe("transition commands (getTransitionPortal)", () => {
  beforeEach(() => RNG.reseed(7));

  it("fails to descend when not standing on a portal and alerts the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // Ensure there are no portals at the player's position
    state.portals = [];
    const startAlerts = state.pendingAlerts.length;

    resolveCommand(state, {
      id: "cmd1",
      type: CommandType.DESCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: player.id,
      priority: 0,
      data: { type: "DESCEND" },
    });

    expect(state.shouldDescend).toBe(false);
    expect(state.pendingAlerts.length).toBeGreaterThan(startAlerts);
    expect(
      state.pendingAlerts.some((a) => a.message === "No stairs here."),
    ).toBe(true);
  });

  it("fails to ascend when not standing on a portal and alerts the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // Ensure there are no portals at the player's position
    state.portals = [];
    const startAlerts = state.pendingAlerts.length;

    resolveCommand(state, {
      id: "cmd2",
      type: CommandType.ASCEND,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: player.id,
      priority: 0,
      data: { type: "ASCEND" },
    });

    expect(state.shouldAscend).toBe(false);
    expect(state.pendingAlerts.length).toBeGreaterThan(startAlerts);
    expect(
      state.pendingAlerts.some((a) => a.message === "No stairs here."),
    ).toBe(true);
  });
});
