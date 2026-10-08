import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { CommandType } from "../../types";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

describe("resting interruption", () => {
  it("stops resting when a non-WAIT command is issued, leaving the time scale normal", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    player.hp = 1;

    // 1. Wait to start resting
    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    expect(player.resting).toBe(true);
    expect(state.sim.targetTimeScale).toBeGreaterThan(1);

    // 2. Issue non-WAIT command
    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.MOVE,
      data: { type: "MOVE", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    expect(player.resting).toBe(false);
    expect(state.sim.targetTimeScale).toBe(0.85); // normal time scale
  });
});
