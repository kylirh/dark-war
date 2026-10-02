import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { CommandType, EventType } from "../../types";
import { RNG } from "../../utils/rng";
import { setPositionFromGrid } from "../../utils/helpers";
import { resolveCommand } from "./commands";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";

describe("death during transition", () => {
  it("cancels transition if player dies", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // Simulate player stepping onto stairs and choosing to descend
    const stairs = state.portals.find((p) => p.id.endsWith("stairs-down"))!;
    setPositionFromGrid(player, stairs.source.x, stairs.source.y);

    resolveCommand(state, {
      id: "descend-cmd",
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.DESCEND,
      data: { type: "DESCEND" },
      priority: 0,
      source: "PLAYER",
    });

    expect(state.shouldDescend).toBe(true);

    // Lethal damage processed *after* the command sets shouldDescend
    state.eventQueue.push({
      id: "lethal-dmg",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: player.id, amount: 100 },
    });

    processEventQueue(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    expect(state.shouldDescend).toBe(false);
  });
});
