import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import { CommandType, EntityKind } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { REST_TIME_SCALE } from "./constants";

describe("resting interruption", () => {
  it("interrupts resting on any non-WAIT command", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.hp = player.hpMax - 1;

    // Remove any monsters to allow resting
    state.entityManager.destroyWhere(
      (entity) => entity.kind === EntityKind.MONSTER,
    );

    // Start resting
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
    state.sim.timeScale = REST_TIME_SCALE;
    state.sim.targetTimeScale = REST_TIME_SCALE;

    // Issue a non-WAIT command (e.g. MOVE)
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
    expect(state.sim.targetTimeScale).toBe(0.85); // Back to normal speed
  });
});
