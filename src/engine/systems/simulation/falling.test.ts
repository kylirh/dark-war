/** Impact timing, accumulated fall distance, and death on the landing floor. */
import { describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import { TileType, HOLE_FALL_DAMAGE, EventType } from "../../types";
import { setStateTile } from "../../utils/state-tiles";
import { applyFallLandingDamage } from "./falling";
import { processEventQueue } from "./events";

it.each([1, 2, 3])(
  "applies quadratic impact damage after %s floors and clears the fall",
  (distance) => {
    const game = new Game({ worldSeed: 17 });
    game.reset(1);
    const state = game.getState();
    state.player.hp = 100;
    state.player.fallDistance = distance;
    applyFallLandingDamage(state, state.player);
    expect(state.player.hp).toBe(100 - HOLE_FALL_DAMAGE * distance ** 2);
    expect(state.player.fallDistance).toBeUndefined();
    applyFallLandingDamage(state, state.player);
    expect(state.player.hp).toBe(100 - HOLE_FALL_DAMAGE * distance ** 2);
  },
);

describe("shaft and lethal landing", () => {
  it("defers damage while a hole remains below the player", () => {
    const game = new Game();
    game.reset(1);
    const state = game.getState();
    setStateTile(state, state.player.gridX, state.player.gridY, TileType.HOLE);
    state.player.fallDistance = 2;
    const hp = state.player.hp;
    applyFallLandingDamage(state, state.player);
    expect(state.player.hp).toBe(hp);
    expect(state.player.fallDistance).toBe(2);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("kills and drops inventory on the destination plane once", () => {
    const game = new Game();
    game.reset(2);
    const state = game.getState();
    state.player.hp = HOLE_FALL_DAMAGE;
    state.player.fallDistance = 1;
    applyFallLandingDamage(state, state.player);
    expect(state.player.hp).toBe(0);
    expect(state.eventQueue[0].type).toBe(EventType.PLAYER_DEATH);
    processEventQueue(state);
    expect(state.player.inventoryDroppedOnDeath).toBe(true);
  });
});
