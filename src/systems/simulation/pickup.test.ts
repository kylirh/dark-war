import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { EntityKind, ItemType, WeaponType, EventType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";
import { CommandType } from "../../types";

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
    const { player, itemId, state } = pickUp(game, ItemType.BONE);

    expect(state.entities.some((e) => e.id === itemId)).toBe(false); // consumed
    expect(player.inventorySlots.some((s) => s.type === ItemType.BONE)).toBe(
      true,
    );
    expect(player.itemCounts[ItemType.BONE]).toBe(1);
  });

  it("adds a panic button to the inventory", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player } = pickUp(game, ItemType.PANIC_BUTTON);
    expect(
      player.inventorySlots.some((s) => s.type === ItemType.PANIC_BUTTON),
    ).toBe(true);
  });

  it("stacks coins by count", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    pickUp(game, ItemType.COIN, 5);
    const { player } = pickUp(game, ItemType.COIN, 3);
    expect(player.itemCounts[ItemType.COIN]).toBe(8);
  });

  it("equips a found weapon and half-charges a laser pistol", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player } = pickUp(game, ItemType.LASER_PISTOL);
    expect(player.weapon).toBe(WeaponType.LASER);
    expect(player.laserCharge).toBe(Math.floor(player.laserChargeMax * 0.5));
  });

  it("a macrometal jacket grants armor that reduces damage", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const { player, state } = pickUp(game, ItemType.MACROMETAL_JACKET);
    expect(player.armor).toBeGreaterThan(0);

    const hpBefore = player.hp;
    state.eventQueue.push({
      id: "dmg",
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: player.id, amount: 5 },
    });
    processEventQueue(state);

    const taken = hpBefore - player.hp;
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(5); // armor softened the blow
  });
});
