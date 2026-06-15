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
