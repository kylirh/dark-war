/**
 * Coverage for the shared death-drop rules.
 *
 * This runs on both the offline simulation and the authoritative server, so
 * the tests pin the whole contract: which items become world entities, how
 * stackables are split, that core devices stay attached to the character, and
 * that the drop happens exactly once per death.
 */

import { describe, it, expect, beforeEach } from "vitest";
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
      inventorySlots: Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => ({
        type: null,
      })),
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
      // spawnDrop passes amount: 1, but ItemEntity only stores `amount` for
      // AMMO, POWERCELL, COIN and ROCK - for a grenade it is discarded.
      expect(entity.amount).toBeUndefined();
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

  it("drops keycards and land mines from their dedicated counters", () => {
    // These two, like ammo and grenades, are tracked as flat player fields
    // rather than in itemCounts, so they need their own stackableQuantity arm.
    const player = makePlayer({ keys: 2, landMines: 1 });

    const dropped = dropPlayerInventoryOnDeath(state, player);

    expect(dropped).toBe(3);
    const types = (state.entityManager.entities as ItemEntity[]).map(
      (e) => e.type,
    );
    expect(types.filter((t) => t === ItemType.KEYCARD)).toHaveLength(2);
    expect(types.filter((t) => t === ItemType.LAND_MINE)).toHaveLength(1);
  });

  it("places every drop at the player's exact world position", () => {
    // Loot has to land where the player died, not snapped to the tile centre.
    const player = makePlayer({ worldX: 333.5, worldY: 412.25, grenades: 2 });
    player.inventorySlots[0].type = ItemType.PISTOL;

    dropPlayerInventoryOnDeath(state, player);

    const entities = state.entityManager.entities as ItemEntity[];
    expect(entities.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(entity.worldX).toBe(333.5);
      expect(entity.worldY).toBe(412.25);
      // Without matching prev coordinates the first render interpolates the
      // item in from wherever the fresh entity started.
      expect(entity.prevWorldX).toBe(entity.worldX);
      expect(entity.prevWorldY).toBe(entity.worldY);
      expect(entity.deathDrop).toBe(true);
    }
  });

  it("drops nothing on a second call for the same death", () => {
    const player = makePlayer({ grenades: 2 });

    expect(dropPlayerInventoryOnDeath(state, player)).toBe(2);
    expect(dropPlayerInventoryOnDeath(state, player)).toBe(0);
    expect(state.entityManager.entities).toHaveLength(2);
  });

  it("drops nothing for an empty inventory", () => {
    const dropped = dropPlayerInventoryOnDeath(state, makePlayer());

    expect(dropped).toBe(0);
    expect(state.entityManager.entities).toHaveLength(0);
  });

  it("never drops a core device even when the player carries both", () => {
    const player = makePlayer({ hasCTDM: true, hasMatterManipulator: true });
    player.inventorySlots[0].type = ItemType.CTDM;
    player.inventorySlots[1].type = ItemType.MATTER_MANIPULATOR;

    dropPlayerInventoryOnDeath(state, player);

    const types = (state.entityManager.entities as ItemEntity[]).map(
      (e) => e.type,
    );
    expect(types).not.toContain(ItemType.CTDM);
    expect(types).not.toContain(ItemType.MATTER_MANIPULATOR);
  });
});
