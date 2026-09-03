import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { ItemType, EventType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { processEventQueue } from "./events";
import { pushEvent } from "./sim-helpers";
import { stepSimulationTick } from "./tick";
import { CommandType } from "../../types";
import { SoundEffect } from "../../content/sound-effects";

function pickUp(game: Game, type: ItemType, amount?: number) {
  const state = game.getState();
  const player = state.player;
  const item = new ItemEntity(player.gridX, player.gridY, type, amount);
  item.worldX = player.worldX;
  item.worldY = player.worldY;
  state.entityManager.spawn(item);
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: player.id,
    type: CommandType.PICKUP,
    data: { type: "PICKUP" } as never,
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
  return { state, player, itemId: item.id };
}

describe("picking up new items lands them in the inventory", () => {
  beforeEach(() => RNG.reseed(42));

  it("adds a bone to an inventory slot with a count", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const storyBefore = game.getState().story.slice();
    const { player, itemId, state } = pickUp(game, ItemType.BONE);

    expect(state.entities.some((e) => e.id === itemId)).toBe(false); // consumed
    expect(player.inventorySlots.some((s) => s.type === ItemType.BONE)).toBe(
      true,
    );
    expect(player.itemCounts[ItemType.BONE]).toBe(1);
    expect(state.pendingSounds).toEqual([]);
    expect(state.story).toEqual(storyBefore);
    expect(state.pendingAlerts).toEqual([]);
  });

  it("adds a panic button to the inventory", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player } = pickUp(game, ItemType.PANIC_BUTTON);
    expect(
      player.inventorySlots.some((s) => s.type === ItemType.PANIC_BUTTON),
    ).toBe(true);
  });

  it("picks up a medkit into its capped emergency inventory slot", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player, state, itemId } = pickUp(game, ItemType.MEDKIT);

    expect(player.itemCounts[ItemType.MEDKIT]).toBe(1);
    expect(
      player.inventorySlots.filter((slot) => slot.type === ItemType.MEDKIT),
    ).toHaveLength(1);
    expect(state.entities.some((entity) => entity.id === itemId)).toBe(false);
  });

  it("leaves a medkit on the ground when the carry limit is reached", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.itemCounts[ItemType.MEDKIT] = 2;
    player.inventorySlots[0] = { type: ItemType.MEDKIT };
    player.inventorySlots[1] = { type: ItemType.MEDKIT };

    const { state, itemId } = pickUp(game, ItemType.MEDKIT);

    expect(player.itemCounts[ItemType.MEDKIT]).toBe(2);
    expect(state.entities.some((entity) => entity.id === itemId)).toBe(true);
    expect(state.pendingAlerts).toEqual([]);
  });

  it("respects a full inventory when picking up a medkit", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.inventorySlots.forEach((slot) => (slot.type = ItemType.PISTOL));

    const { state, itemId } = pickUp(game, ItemType.MEDKIT);

    expect(state.entities.some((entity) => entity.id === itemId)).toBe(true);
    expect(player.itemCounts[ItemType.MEDKIT] ?? 0).toBe(0);
    expect(state.pendingAlerts).toEqual([]);
  });

  it("stacks coins by count", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    pickUp(game, ItemType.COIN, 5);
    const { player, state } = pickUp(game, ItemType.COIN, 3);
    expect(player.itemCounts[ItemType.COIN]).toBe(8);
    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.COINS_1 ||
          sound.effect === SoundEffect.COINS_2 ||
          sound.effect === SoundEffect.COINS_3 ||
          sound.effect === SoundEffect.COINS_4,
      ),
    ).toBe(true);
  });

  it("stores a found weapon without changing the selected slot", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const before = game.getState().player;
    const selectedBefore = before.selectedBarSlot;
    const weaponBefore = before.weapon;
    const { player } = pickUp(game, ItemType.LASER_PISTOL);
    expect(player.selectedBarSlot).toBe(selectedBefore);
    expect(player.weapon).toBe(weaponBefore);
    expect(player.laserCharge).toBe(Math.floor(player.laserChargeMax * 0.5));
  });

  it("keeps ordinary item pickups silent while preserving core-device messages", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const storyBefore = game.getState().story.slice();

    const { state } = pickUp(game, ItemType.KEYCARD);
    expect(state.story).toEqual(storyBefore);
    expect(state.pendingAlerts).toEqual([]);

    pickUp(game, ItemType.CTDM);
    expect(state.story).toContain(
      "CTDM installed. Danger now triggers time dilation.",
    );

    pickUp(game, ItemType.MATTER_MANIPULATOR);
    expect(state.story).toContain(
      "Matter Manipulator acquired. Press F to mine and place walls.",
    );
  });

  it("does not place a new weapon into the selected empty slot", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.selectedBarSlot = 0;
    player.inventorySlots[0] = { type: null };

    pickUp(game, ItemType.PICKAXE);

    expect(player.selectedBarSlot).toBe(0);
    expect(player.inventorySlots[0].type).toBeNull();
    expect(
      player.inventorySlots.some((slot) => slot.type === ItemType.PICKAXE),
    ).toBe(true);
  });

  it("leaves a weapon on the ground when only the selected slot is empty", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.selectedBarSlot = 0;
    player.inventorySlots.forEach((slot) => {
      slot.type = ItemType.MEDKIT;
    });
    player.inventorySlots[0].type = null;

    const { itemId, state } = pickUp(game, ItemType.PICKAXE);

    expect(player.inventorySlots[0].type).toBeNull();
    expect(
      player.inventorySlots.some((slot) => slot.type === ItemType.PICKAXE),
    ).toBe(false);
    expect(state.entities.some((entity) => entity.id === itemId)).toBe(true);
  });

  it("a macrometal jacket grants armor that reduces damage", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player, state } = pickUp(game, ItemType.MACROMETAL_JACKET);
    expect(player.armor).toBeGreaterThan(0);

    const hpBefore = player.hp;
    pushEvent(state, {
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: player.id, amount: 5 },
    });
    processEventQueue(state);

    const taken = hpBefore - player.hp;
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(5); // armor softened the blow
    expect(state.pendingAlerts).toEqual([]);
  });
});
