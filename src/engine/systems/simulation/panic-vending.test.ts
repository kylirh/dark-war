import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { ItemType, CommandType, TileType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { SoundEffect } from "../../content/sound-effects";

function interact(
  game: Game,
  x: number,
  y: number,
): ReturnType<Game["getState"]> {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.INTERACT,
    data: { type: "INTERACT", x, y },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
  return state;
}

describe("locked doors", () => {
  beforeEach(() => RNG.reseed(1));

  it("plays scan then unlock when a keycard unlocks the door", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    const x = player.gridX + 1;
    const y = player.gridY;
    state.tiles.setTile(x, y, TileType.DOOR_LOCKED);
    player.keys = 1;

    interact(game, x, y);

    expect(player.keys).toBe(0);
    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_OPEN);
    const effects = state.pendingSounds.map((sound) => sound.effect);
    expect(effects).toContain(SoundEffect.DOOR_SCAN);
    expect(effects).toContain(SoundEffect.DOOR_UNLOCK);
    expect(effects.indexOf(SoundEffect.DOOR_SCAN)).toBeLessThan(
      effects.indexOf(SoundEffect.DOOR_UNLOCK),
    );
    expect(effects.indexOf(SoundEffect.DOOR_UNLOCK)).toBeLessThan(
      effects.indexOf(SoundEffect.DOOR_OPEN),
    );
    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.DOOR_FIDDLE_1 ||
          sound.effect === SoundEffect.DOOR_FIDDLE_2,
      ),
    ).toBe(false);
  });

  it("does not scan when the player has no keycard", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    const x = player.gridX + 1;
    const y = player.gridY;
    state.tiles.setTile(x, y, TileType.DOOR_LOCKED);
    player.keys = 0;

    interact(game, x, y);

    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_LOCKED);
    expect(
      state.pendingSounds.some(
        (sound) => sound.effect === SoundEffect.DOOR_SCAN,
      ),
    ).toBe(false);
    expect(
      state.pendingSounds.some(
        (sound) => sound.effect === SoundEffect.DOOR_UNLOCK,
      ),
    ).toBe(false);
    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.DOOR_FIDDLE_1 ||
          sound.effect === SoundEffect.DOOR_FIDDLE_2,
      ),
    ).toBe(true);
  });
});

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
