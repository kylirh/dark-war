import { describe, it, expect } from "vitest";
import { MonsterEntity } from "./monster-entity";
import { EntityKind, MonsterType, ItemType } from "../types";
import { RNG } from "../utils/rng";

describe("MonsterEntity", () => {
  it("is a MONSTER carrying its type and full HP", () => {
    const m = new MonsterEntity(2, 3, MonsterType.MUTANT, 1);
    expect(m.kind).toBe(EntityKind.MONSTER);
    expect(m.type).toBe(MonsterType.MUTANT);
    expect(m.hp).toBe(m.hpMax);
    expect(m.hp).toBeGreaterThan(0);
  });

  it("scales HP with depth", () => {
    const shallow = new MonsterEntity(0, 0, MonsterType.MUTANT, 1);
    const deep = new MonsterEntity(0, 0, MonsterType.MUTANT, 8);
    expect(deep.hpMax).toBeGreaterThan(shallow.hpMax);
  });

  it("gives utility bots more HP than skulkers at the same depth", () => {
    const bot = new MonsterEntity(0, 0, MonsterType.UTILITY_BOT, 3);
    const skulker = new MonsterEntity(0, 0, MonsterType.SKULKER, 3);
    expect(bot.hpMax).toBeGreaterThan(skulker.hpMax);
  });

  it("spawns Snagglepuss with talk affordance and correct social defId", () => {
    const m = new MonsterEntity(0, 0, MonsterType.SNAGGLEPUSS, 1);
    expect(m.social?.defId).toBe("wildlife.snagglepuss");
    expect(m.interactable?.affordances).toContain("talk");
  });

  it("spawns Zyth and Terrorist Collaborator with a pistol and no laser charge", () => {
    // Add ItemType to imports if needed, we'll assume it's imported for now, oh wait we need to import it
    const zyth = new MonsterEntity(0, 0, MonsterType.ZYTH, 5);
    const collaborator = new MonsterEntity(0, 0, MonsterType.TERRORIST_COLLABORATOR, 6);

    expect(zyth.equippedWeapon).toBe(ItemType.PISTOL);
    expect(zyth.laserCharge).toBe(0);

    expect(collaborator.equippedWeapon).toBe(ItemType.PISTOL);
    expect(collaborator.laserCharge).toBe(0);
  });

  describe("inventory and initial loadout", () => {
    it("respects cannotCarryItems flag, ensuring 0 bullets/grenades/mines", () => {
      // Wild dog and icky lump have cannotCarryItems
      const dog = new MonsterEntity(0, 0, MonsterType.WILD_DOG, 1);
      const lump = new MonsterEntity(0, 0, MonsterType.ICKY_LUMP, 1);

      expect(dog.bullets).toBe(0);
      expect(dog.grenades).toBe(0);
      expect(dog.landMines).toBe(0);

      expect(lump.bullets).toBe(0);
      expect(lump.grenades).toBe(0);
      expect(lump.landMines).toBe(0);
    });

    it("generates random bullets and occasional grenades for ranged monsters", () => {
      // Test skulker (behavior: ranged, rangedBullets: [3, 8])
      // Force random to max chance for grenades and max bullets
      RNG.reseed(0); // Find a seed that works or iterate
      let hasGrenade = false;
      for (let i = 0; i < 20; i++) {
        const skulker = new MonsterEntity(0, 0, MonsterType.SKULKER, 1);
        expect(skulker.bullets).toBeGreaterThanOrEqual(3);
        expect(skulker.bullets).toBeLessThanOrEqual(8);
        expect(skulker.landMines).toBe(0); // Ranged never get land mines
        if (skulker.grenades > 0) {
          hasGrenade = true;
          expect(skulker.grenades).toBe(1);
        }
      }
      expect(hasGrenade).toBe(true);
    });

    it("generates occasional grenades or land mines for melee monsters", () => {
      // Test mutant (behavior: melee)
      let hasGrenade = false;
      let hasMine = false;

      RNG.reseed(12345);
      for (let i = 0; i < 50; i++) {
        const mutant = new MonsterEntity(0, 0, MonsterType.MUTANT, 1);
        expect(mutant.bullets).toBe(0); // Melee never get bullets
        if (mutant.grenades > 0) {
          hasGrenade = true;
          expect(mutant.grenades).toBe(1);
          expect(mutant.landMines).toBe(0); // If grenade, no land mine
        } else if (mutant.landMines > 0) {
          hasMine = true;
          expect(mutant.landMines).toBe(1);
          expect(mutant.grenades).toBe(0); // If land mine, no grenade
        }
      }
      expect(hasGrenade).toBe(true);
      expect(hasMine).toBe(true);
    });
  });
});
