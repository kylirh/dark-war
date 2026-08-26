import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GameState,
  Player,
  ItemType,
  WeaponType,
  INVENTORY_TOTAL_SLOTS,
} from "../types";
import { EntityManager } from "../core/entity-manager";
import { dropPlayerInventoryOnDeath } from "./player-respawn";
import { ItemEntity } from "../entities/item-entity";

describe("dropPlayerInventoryOnDeath", () => {
  let state: GameState;

  function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
      gridX: 10,
      gridY: 10,
      worldX: 320,
      worldY: 320,
      inventorySlots: Array.from({ length: 36 }, () => ({ type: null })),
      itemCounts: {},
      ammo: 0,
      ammoReserve: 0,
      grenades: 0,
      landMines: 0,
      keys: 0,
      armor: 0,
      laserCharge: 0,
      panicCharge: 0,
      weapon: WeaponType.MELEE,
      selectedBarSlot: 0,
      ctdmEnabled: false,
      matterManipulatorActive: false,
      inventoryDroppedOnDeath: false,
      hasCTDM: false,
      hasMatterManipulator: false,
      ...overrides,
    } as unknown as Player;
  }

  beforeEach(() => {
    state = {
      entityManager: new EntityManager([]),
    } as unknown as GameState;
  });

  it("returns 0 and does nothing if inventoryDroppedOnDeath is true", () => {
    const player = makePlayer({ inventoryDroppedOnDeath: true, ammo: 10 });
    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(0);
    expect(state.entityManager.entities).toHaveLength(0);
    expect(player.ammo).toBe(10); // Check that reset logic was skipped
  });

  it("drops AMMO as a single entity with combined amount", () => {
    const player = makePlayer({ ammo: 15.5, ammoReserve: 20.2 });
    // Simulate ammo being somewhat in slots but mostly we rely on stackableQuantity which uses ammo + ammoReserve
    player.inventorySlots[0].type = ItemType.AMMO;

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(1);
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe(ItemType.AMMO);
    expect(entities[0].amount).toBe(35); // Math.max(0, Math.floor(15.5 + 20.2)) = 35
    expect(entities[0].deathDrop).toBe(true);
  });

  it("drops other stackables (like GRENADE) as multiple individual entities of amount 1", () => {
    const player = makePlayer({ grenades: 3.8 });
    player.inventorySlots[0].type = ItemType.GRENADE;

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(3); // Math.floor(3.8) = 3
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities).toHaveLength(3);
    for (const entity of entities) {
      expect(entity.type).toBe(ItemType.GRENADE);
      expect(entity.amount).toBeUndefined(); // Stackable individual entities (grenades) do not have amount initialized
      expect(entity.deathDrop).toBe(true);
    }
  });

  it("drops stackables tracked via itemCounts even if not in inventorySlots (e.g., ROCK)", () => {
    const player = makePlayer({
      itemCounts: { [ItemType.ROCK]: 2 },
    });

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(2);
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities).toHaveLength(2);
    for (const entity of entities) {
      expect(entity.type).toBe(ItemType.ROCK);
      expect(entity.amount).toBe(1); // For rock, amount = amount ?? 1
    }
  });

  it("drops non-stackable items exactly as they appear in inventorySlots", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[1].type = ItemType.LASER_PISTOL;
    player.inventorySlots[2].type = ItemType.PISTOL; // second pistol

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(3);
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities).toHaveLength(3);

    const types = entities.map((e) => e.type);
    expect(types.filter((t) => t === ItemType.PISTOL)).toHaveLength(2);
    expect(types.filter((t) => t === ItemType.LASER_PISTOL)).toHaveLength(1);
  });

  it("correctly handles non-stackable items like PISTOL", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[1].type = ItemType.LASER_PISTOL;

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(2);
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities).toHaveLength(2);
    const types = entities.map((e) => e.type);
    expect(types).toContain(ItemType.PISTOL);
    expect(types).toContain(ItemType.LASER_PISTOL);
  });

  it("retains core devices and updates player flags", () => {
    const player = makePlayer();
    player.inventorySlots[0].type = ItemType.PISTOL;
    player.inventorySlots[1].type = ItemType.CTDM;
    player.inventorySlots[2].type = ItemType.MATTER_MANIPULATOR;
    player.hasCTDM = false; // should be set to true
    player.hasMatterManipulator = false; // should be set to true

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(1); // only the pistol drops
    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities[0].type).toBe(ItemType.PISTOL);

    expect(player.hasCTDM).toBe(true);
    expect(player.hasMatterManipulator).toBe(true);

    // Check that core devices are still in inventory slots
    const slotTypes = player.inventorySlots.map((s) => s.type);
    expect(slotTypes).toContain(ItemType.CTDM);
    expect(slotTypes).toContain(ItemType.MATTER_MANIPULATOR);
    expect(slotTypes).not.toContain(ItemType.PISTOL); // pistol should be gone from slots
  });

  it("resets player stats and flags", () => {
    const player = makePlayer({
      ammo: 50,
      ammoReserve: 100,
      grenades: 5,
      keys: 2,
      landMines: 3,
      armor: 10,
      laserCharge: 20,
      panicCharge: 1,
      weapon: WeaponType.PISTOL,
      selectedBarSlot: 5,
      ctdmEnabled: true,
      matterManipulatorActive: true,
      itemCounts: { [ItemType.ROCK]: 5 },
    });

    dropPlayerInventoryOnDeath(state, player);

    expect(player.ammo).toBe(0);
    expect(player.ammoReserve).toBe(0);
    expect(player.grenades).toBe(0);
    expect(player.keys).toBe(0);
    expect(player.landMines).toBe(0);
    expect(player.armor).toBe(0);
    expect(player.laserCharge).toBe(0);
    expect(player.panicCharge).toBe(0);
    expect(player.weapon).toBe(WeaponType.MELEE);
    expect(player.selectedBarSlot).toBe(0);
    expect(player.ctdmEnabled).toBe(false);
    expect(player.matterManipulatorActive).toBe(false);
    expect(player.itemCounts).toEqual({});
    expect(player.inventoryDroppedOnDeath).toBe(true);
  });
});
