import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import {
  CommandType,
  EventType,
  GameState,
  HOLE_FALL_DAMAGE,
  ItemType,
} from "../../types";
import { idxFor, setPositionFromGrid } from "../../utils/helpers";
import { resolveCommand } from "./commands";
import { MAX_EVENTS_PER_TICK } from "./constants";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";

/**
 * `shouldDescend` / `shouldAscend` are set while commands resolve (step 1 of
 * `stepSimulationTick`) but consumed by the host after the tick ends. The event
 * queue runs in between, so a player can die after committing to a transition.
 */
function dungeonAtDepthOne(): Game {
  const game = new Game({ mode: "offline" });
  game.reset(1);
  return game;
}

function pushLethalDamage(state: GameState, targetId: string): void {
  state.eventQueue.push({
    id: "lethal-dmg",
    depth: state.depth,
    type: EventType.DAMAGE,
    data: { type: "DAMAGE", targetId, amount: 100 },
  });
}

/** Inert events, used only to push the queue past a pass's event budget. */
function pushFillerEvents(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    state.eventQueue.push({
      id: `filler-${i}`,
      depth: state.depth,
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "filler" },
    });
  }
}

describe("death during transition", () => {
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
   * `stepSimulationTick` drains the queue twice -- step 4, then again after
   * `processHoleFalls` -- and each pass gets its own `MAX_EVENTS_PER_TICK`
   * budget, so a `PLAYER_DEATH` deferred by the first pass is normally
   * collected by the second. It outlives the tick only when the lethal hit
   * lands inside the first budget and more than a second budget's worth of
   * events sits between it and the death appended to the tail. Cancelling in
   * `processPlayerDeathEvent` alone leaves the flags set with the player dead,
   * and the host warps a corpse down the stairs.
   */
  it("cancels a pending descend when the death event outlives the tick", () => {
    const state = dungeonAtDepthOne().getState();
    const player = state.player;

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

    pushLethalDamage(state, player.id);
    // Derived from the constant rather than hardcoded: the case is only
    // meaningful while the tail stays out of reach of both budgets.
    pushFillerEvents(state, 2 * MAX_EVENTS_PER_TICK + 2);

    stepSimulationTick(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    // The deferral the eager cancellation exists for: nothing cleared these
    // flags on the way out of the tick except `processDamageEvent`.
    expect(
      state.eventQueue.some((event) => event.type === EventType.PLAYER_DEATH),
    ).toBe(true);
    expect(state.shouldDescend).toBe(false);
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

/**
 * Both entry points into player death zero the player's velocity, so a corpse
 * does not keep sliding under the inertia it had when it died.
 *
 * The black-pill case pins `processPlayerDeathEvent`'s copy specifically: that
 * path sets `hp = 0` and pushes `PLAYER_DEATH` directly, without a `DAMAGE`
 * event. The damage case pins the observable behaviour through the ordinary
 * combat path, where either copy satisfies it — `processDamageEvent` zeroes on
 * the lethal hit and the `PLAYER_DEATH` it pushes drains in the same
 * `processEventQueue` call. That earlier copy is not redundant: a cascade that
 * trips `MAX_EVENTS_PER_TICK` leaves the queued `PLAYER_DEATH` for the next
 * tick, and the player would slide until then.
 */
describe("death stops movement", () => {
  it("stops a player's movement on death from eating a black pill", () => {
    const state = dungeonAtDepthOne().getState();
    const player = state.player;

    player.velocityX = 100;
    player.velocityY = 100;
    player.selectedBarSlot = 0;
    player.inventorySlots[0] = { type: ItemType.BLACK_PILL };

    resolveCommand(state, {
      id: "pill",
      type: CommandType.USE_ITEM,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: player.id,
      priority: 0,
      data: { type: "USE_ITEM", dx: 1, dy: 0 },
    });

    processEventQueue(state);

    expect(player.hp).toBe(0);
    expect(player.velocityX).toBe(0);
    expect(player.velocityY).toBe(0);
  });

  it("stops a player's movement on death from damage", () => {
    const state = dungeonAtDepthOne().getState();
    const player = state.player;

    player.velocityX = 100;
    player.velocityY = 100;

    pushLethalDamage(state, player.id);
    processEventQueue(state);

    expect(player.hp).toBeLessThanOrEqual(0);
    expect(player.velocityX).toBe(0);
    expect(player.velocityY).toBe(0);
  });

  it("stops a player's movement on death from damage when event queue cascades", () => {
    const state = dungeonAtDepthOne().getState();
    const player = state.player;

    player.velocityX = 100;
    player.velocityY = 100;

    // Exactly enough filler that the lethal damage is the last event processed
    // this tick, so the PLAYER_DEATH it pushes falls past the limit. Derived
    // from the constant: a hardcoded count would stop hitting the boundary if
    // the limit ever changed, silently reducing this to the test above.
    for (let i = 0; i < MAX_EVENTS_PER_TICK; i++) {
      state.eventQueue.push({
        id: `evt-${i}`,
        depth: state.depth,
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "test event" },
      });
    }
    pushLethalDamage(state, player.id);

    processEventQueue(state);

    // The deferral this guard exists for: PLAYER_DEATH is still queued, so the
    // velocity below was zeroed by processDamageEvent and not by the death
    // handler.
    expect(state.eventQueue.map((event) => event.type)).toEqual([
      EventType.PLAYER_DEATH,
    ]);
    expect(player.hp).toBeLessThanOrEqual(0);
    expect(player.velocityX).toBe(0);
    expect(player.velocityY).toBe(0);
  });
});
