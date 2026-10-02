import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { CommandType, EventType, HOLE_FALL_DAMAGE } from "../../types";
import { idxFor, setPositionFromGrid } from "../../utils/helpers";
import { resolveCommand } from "./commands";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";

/**
 * `shouldDescend` / `shouldAscend` are set while commands resolve (step 1 of
 * `stepSimulationTick`) but consumed by the host after the tick ends. The event
 * queue runs in between, so a player can die after committing to a transition.
 */
describe("death during transition", () => {
  function dungeonAtDepthOne() {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    return game;
  }

  function pushLethalDamage(
    state: ReturnType<Game["getState"]>,
    targetId: string,
  ): void {
    state.eventQueue.push({
      id: "lethal-dmg",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId, amount: 100 },
    });
  }

  it("cancels a pending descend when the player dies", () => {
    const state = dungeonAtDepthOne().getState();
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
    expect(state.pendingPortalId).toBe(stairs.id);

    // Lethal damage processed *after* the command sets shouldDescend
    pushLethalDamage(state, player.id);
    processEventQueue(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    expect(state.shouldDescend).toBe(false);
    expect(state.pendingPortalId).toBeUndefined();
  });

  it("cancels a pending ascend when the player dies", () => {
    const state = dungeonAtDepthOne().getState();
    const player = state.player;

    const stairs = state.portals.find((p) => p.id.endsWith("stairs-up"))!;
    setPositionFromGrid(player, stairs.source.x, stairs.source.y);

    resolveCommand(state, {
      id: "ascend-cmd",
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.ASCEND,
      data: { type: "ASCEND" },
      priority: 0,
      source: "PLAYER",
    });

    expect(state.shouldAscend).toBe(true);

    pushLethalDamage(state, player.id);
    processEventQueue(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    expect(state.shouldAscend).toBe(false);
    expect(state.pendingPortalId).toBeUndefined();
  });

  /**
   * `triggerPlayerFall` sets `shouldDescend` and queues `HOLE_FALL_DAMAGE` in
   * the same tick, so the fall itself can be the lethal blow. The transition is
   * cancelled with every other one: the player dies on the floor they fell
   * from rather than arriving dead on the one below.
   */
  it("cancels the descend when the fall through a hole is itself lethal", () => {
    const game = dungeonAtDepthOne();
    const state = game.getState();
    const player = state.player;
    player.hp = HOLE_FALL_DAMAGE;

    state.holeCreatedTiles = new Set([
      idxFor(player.gridX, player.gridY, state.mapWidth),
    ]);

    stepSimulationTick(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    expect(state.shouldDescend).toBe(false);
    expect(state.descendTarget).toBeUndefined();
  });
});
