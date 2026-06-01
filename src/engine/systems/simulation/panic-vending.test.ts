import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { ItemType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

describe("panic button", () => {
  beforeEach(() => RNG.reseed(1));

  it("warps the player toward safety when fully charged", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    const state = game.getState();
    const player = state.player;
    player.panicCharge = player.panicChargeMax;
    player.selectedBarSlot = 0;
    player.inventorySlots[0] = { type: ItemType.PANIC_BUTTON };

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.USE_ITEM,
      data: { type: "USE_ITEM", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    expect(state.shouldAscend).toBe(true);
    expect(player.panicCharge).toBe(0);
  });

  it("does nothing while still charging", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    const state = game.getState();
    const player = state.player;
    player.panicCharge = 0;
    player.selectedBarSlot = 0;
    player.inventorySlots[0] = { type: ItemType.PANIC_BUTTON };

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.USE_ITEM,
      data: { type: "USE_ITEM", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);
    expect(state.shouldAscend).toBe(false);
  });
});

describe("vending machine", () => {
  beforeEach(() => RNG.reseed(1));

  it("sells a random item for coins on interact", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.itemCounts[ItemType.COIN] = 10;

    const mx = player.gridX + 1;
    const my = player.gridY;
    state.entityManager.spawn(new ItemEntity(mx, my, ItemType.VENDING_MACHINE));

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.INTERACT,
      data: { type: "INTERACT", x: mx, y: my },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    expect(player.itemCounts[ItemType.COIN]).toBe(5); // -5 per purchase
  });

  it("refuses to sell without enough coins", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.itemCounts[ItemType.COIN] = 2;

    const mx = player.gridX + 1;
    const my = player.gridY;
    state.entityManager.spawn(new ItemEntity(mx, my, ItemType.VENDING_MACHINE));

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.INTERACT,
      data: { type: "INTERACT", x: mx, y: my },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);
    expect(player.itemCounts[ItemType.COIN]).toBe(2); // unchanged
  });
});
