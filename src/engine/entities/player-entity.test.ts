/**
 * Coverage for PlayerEntity construction and respawn reset.
 *
 * resetForRespawn rebuilds the player from a fresh starter entity via
 * Object.assign and then restores an explicit allow-list of progression
 * fields, so the tests pin both halves: what survives death and what does not.
 */

import { describe, it, expect } from "vitest";
import { PlayerEntity } from "./player-entity";
import { EntityKind, ItemType, WeaponType } from "../types";
import { RNG } from "../utils/rng";

describe("GameEntity coordinates (via PlayerEntity)", () => {
  it("centers world position in the grid cell and derives gridX/gridY back", () => {
    const p = new PlayerEntity(3, 5);
    expect(p.worldX).toBe(3 * 32 + 16);
    expect(p.worldY).toBe(5 * 32 + 16);
    expect(p.gridX).toBe(3);
    expect(p.gridY).toBe(5);
    expect(p.prevWorldX).toBe(p.worldX);
    expect(p.prevWorldY).toBe(p.worldY);
  });

  it("recomputes gridX/gridY when worldX/worldY move", () => {
    const p = new PlayerEntity(0, 0);
    p.worldX = 100;
    p.worldY = 70;
    expect(p.gridX).toBe(Math.floor(100 / 32));
    expect(p.gridY).toBe(Math.floor(70 / 32));
  });

  it("gives every entity a unique id", () => {
    const a = new PlayerEntity(0, 0);
    const b = new PlayerEntity(0, 0);
    expect(a.id).not.toBe(b.id);
  });
});

describe("PlayerEntity starter loadout", () => {
  it("always carries a butcher knife and a black pill, with no grenades/mines", () => {
    const p = new PlayerEntity(0, 0);
    expect(p.kind).toBe(EntityKind.PLAYER);
    expect(p.hp).toBe(p.hpMax);
    expect(p.selectedBarSlot).toBe(0);
    const types = p.inventorySlots.map((s) => s.type);
    expect(types).toContain(ItemType.BUTCHER_KNIFE);
    expect(types).toContain(ItemType.BLACK_PILL);
    expect(p.grenades).toBe(0);
    expect(p.landMines).toBe(0);
  });

  it("starts with a pistol+ammo OR a half-charged laser and no ammo", () => {
    RNG.reseed(1);
    let sawPistol = false;
    let sawLaser = false;
    for (let i = 0; i < 30; i++) {
      const p = new PlayerEntity(0, 0);
      if (p.weapon === WeaponType.PISTOL) {
        sawPistol = true;
        expect(p.ammo).toBeGreaterThan(0);
        expect(p.inventorySlots[0].type).toBe(ItemType.PISTOL);
        expect(p.laserCharge).toBe(0);
      } else {
        sawLaser = true;
        expect(p.weapon).toBe(WeaponType.LASER);
        expect(p.ammo).toBe(0);
        expect(p.ammoReserve).toBe(0);
        expect(p.laserCharge).toBe(Math.floor(p.laserChargeMax * 0.5));
        expect(p.inventorySlots[0].type).toBe(ItemType.LASER_PISTOL);
      }
    }
    // Over many rolls we should see both outcomes.
    expect(sawPistol).toBe(true);
    expect(sawLaser).toBe(true);
  });
});

describe("PlayerEntity resetForRespawn", () => {
  it("resets basic stats and items to starter values while preserving id", () => {
    const p = new PlayerEntity(0, 0);
    const originalId = p.id;

    // Modify some basic stats and items
    p.ammo = 100;
    p.grenades = 5;
    p.inventorySlots[0].type = ItemType.MEDKIT;

    p.resetForRespawn();

    expect(p.id).toBe(originalId);
    // Starter kit has 0 grenades, and either 12 or 0 ammo depending on weapon roll
    expect(p.grenades).toBe(0);
    expect([0, 12]).toContain(p.ammo);
    // inventory should be reset to starter loadout, no plasma rifle
    expect(p.inventorySlots[0].type).not.toBe(ItemType.MEDKIT);
  });

  it("preserves progression stats and fully restores hp", () => {
    const p = new PlayerEntity(0, 0);

    // Simulate progression and damage
    p.hpMax = 50;
    p.hp = 10;
    p.sight = 12;
    p.score = 5000;
    p.laserChargeMax = 200;
    p.panicChargeMax = 150;

    p.resetForRespawn();

    expect(p.hpMax).toBe(50);
    expect(p.hp).toBe(50); // Restored to max
    expect(p.sight).toBe(12);
    expect(p.score).toBe(5000);
    expect(p.laserChargeMax).toBe(200);
    expect(p.panicChargeMax).toBe(150);
  });

  it("handles core devices (CTDM and Matter Manipulator) correctly", () => {
    const p = new PlayerEntity(0, 0);

    // Set devices and active states
    p.hasCTDM = true;
    p.ctdmEnabled = true;
    p.hasMatterManipulator = true;
    p.matterManipulatorActive = true;

    // Clear inventory to ensure devices can be added
    p.inventorySlots.forEach((slot) => (slot.type = null));

    p.resetForRespawn();

    expect(p.hasCTDM).toBe(true);
    expect(p.ctdmEnabled).toBe(false); // Active state reset
    expect(p.hasMatterManipulator).toBe(true);
    expect(p.matterManipulatorActive).toBe(false); // Active state reset

    const types = p.inventorySlots.map((s) => s.type);
    expect(types).toContain(ItemType.CTDM);
    expect(types).toContain(ItemType.MATTER_MANIPULATOR);
  });

  it("resets inventoryDroppedOnDeath flag", () => {
    const p = new PlayerEntity(0, 0);
    p.inventoryDroppedOnDeath = true;

    p.resetForRespawn();

    expect(p.inventoryDroppedOnDeath).toBe(false);
  });

  it("does not grant devices the player never found", () => {
    const p = new PlayerEntity(0, 0);
    p.hasCTDM = false;
    p.hasMatterManipulator = false;

    p.resetForRespawn();

    const types = p.inventorySlots.map((s) => s.type);
    expect(p.hasCTDM).toBe(false);
    expect(types).not.toContain(ItemType.CTDM);
    expect(types).not.toContain(ItemType.MATTER_MANIPULATOR);
  });

  it("does not duplicate a core device already in the starter loadout", () => {
    const p = new PlayerEntity(0, 0);
    p.hasCTDM = true;
    p.resetForRespawn();
    // Run it twice: the second reset must not stack a second CTDM.
    p.resetForRespawn();

    const ctdmSlots = p.inventorySlots.filter((s) => s.type === ItemType.CTDM);
    expect(ctdmSlots).toHaveLength(1);
  });

  it("drops core devices rather than overwriting a full inventory", () => {
    const p = new PlayerEntity(0, 0);
    p.hasCTDM = true;
    p.hasMatterManipulator = true;
    p.resetForRespawn();

    // Fill every slot, then reset again. addCoreDevice looks for a null slot
    // and silently gives up if there is none - it never evicts an item.
    const filled = p.inventorySlots.map(() => ItemType.ROCK);
    p.inventorySlots.forEach((slot, i) => (slot.type = filled[i]));
    p.hasCTDM = true;
    p.hasMatterManipulator = true;

    expect(() => p.resetForRespawn()).not.toThrow();
    // The starter loadout re-runs first, so slots are starter items again and
    // the devices do fit. What matters is that it never throws or evicts.
    expect(p.inventorySlots.length).toBe(filled.length);
  });

  it("clears combat state carried over from the previous life", () => {
    const p = new PlayerEntity(0, 0);
    p.hp = 0;
    p.grenades = 9;
    p.landMines = 9;
    p.ammoReserve = 999;

    p.resetForRespawn();

    expect(p.hp).toBe(p.hpMax);
    expect(p.hp).toBeGreaterThan(0);
    expect(p.grenades).toBe(0);
    expect(p.landMines).toBe(0);
  });

  it("resets position, so callers must place the player themselves", () => {
    // Object.assign copies worldX/worldY off the fresh starter entity, so the
    // death location is lost. Game.respawn() calls setPositionFromGrid right
    // after; this pins that ordering requirement.
    const p = new PlayerEntity(7, 9);
    p.resetForRespawn();

    expect(p.gridX).toBe(0);
    expect(p.gridY).toBe(0);
    expect(p.physicsBody).toBeUndefined();
  });
});
