import { describe, it, expect } from "vitest";
import { PlayerEntity } from "./player-entity";
import { EntityKind, ItemType, WeaponType } from "../types";

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

describe("PlayerEntity defaults", () => {
  it("starts with a pistol loadout and the standard bar items", () => {
    const p = new PlayerEntity(0, 0);
    expect(p.kind).toBe(EntityKind.PLAYER);
    expect(p.weapon).toBe(WeaponType.PISTOL);
    expect(p.hp).toBe(p.hpMax);
    expect(p.selectedBarSlot).toBe(0);
    expect(p.inventorySlots[0].type).toBe(ItemType.PISTOL);
    expect(p.inventorySlots[2].type).toBe(ItemType.GRENADE);
    expect(p.ammo).toBeGreaterThan(0);
    expect(p.grenades).toBeGreaterThan(0);
  });
});
