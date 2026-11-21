/** Online falls must use ordinary death cleanup in the source plane. */
import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/core/game";
import { HOLE_FALL_DAMAGE, ItemType } from "../src/engine/types";
import { processEventQueue } from "../src/engine/systems/simulation/events";
import { applyHoleFallDamage } from "./hole-fall";

describe("authoritative hole fall", () => {
  it("queues death once and drops inventory on the source plane", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.hp = HOLE_FALL_DAMAGE;
    player.velocityX = 200;
    player.itemCounts[ItemType.COIN] = 7;
    expect(applyHoleFallDamage(state, player)).toBe(false);
    expect(player.hp).toBe(0);
    expect(player.velocityX).toBe(0);
    expect(state.eventQueue).toHaveLength(1);
    expect(applyHoleFallDamage(state, player)).toBe(false);
    expect(state.eventQueue).toHaveLength(1);
    processEventQueue(state);
    expect(player.inventoryDroppedOnDeath).toBe(true);
    expect(
      state.pendingAlerts.some((alert) => alert.message === "You have died."),
    ).toBe(true);
  });

  it("applies fall damage once before allowing a survivor to migrate", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const state = game.getState();
    state.player.hp = HOLE_FALL_DAMAGE + 1;
    expect(applyHoleFallDamage(state, state.player)).toBe(true);
    expect(state.player.hp).toBe(1);
    expect(state.eventQueue).toHaveLength(0);
  });
});
