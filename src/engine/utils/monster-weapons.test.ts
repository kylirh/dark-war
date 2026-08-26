/**
 * Coverage for the shared monster weapon-selection rules.
 *
 * These helpers decide what an adaptive monster picks up, equips, and can fire,
 * so the tests pin the defaults for non-adaptive species, the ammo and charge
 * thresholds, and the melee damage floors.
 */

import { describe, it, expect } from "vitest";
import { ItemType, Monster, MonsterType, WeaponType } from "../types";
import {
  isAdaptiveWeaponMonster,
  isMonsterPrimaryWeapon,
  monsterWeaponScore,
  equippedMonsterWeaponItem,
  equippedMonsterWeaponType,
  monsterCanUseEquippedWeapon,
  monsterMeleeDamage,
  MONSTER_SHOTGUN_AMMO_COST,
  MONSTER_LASER_SHOT_COST,
} from "./monster-weapons";

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    type: MonsterType.MUTANT,
    bullets: 0,
    laserCharge: 0,
    dmg: 2,
    ...overrides,
  } as unknown as Monster;
}

describe("isAdaptiveWeaponMonster", () => {
  it("returns true for adaptive monsters", () => {
    expect(
      isAdaptiveWeaponMonster(makeMonster({ type: MonsterType.ZYTH })),
    ).toBe(true);
    expect(
      isAdaptiveWeaponMonster(
        makeMonster({ type: MonsterType.TERRORIST_COLLABORATOR }),
      ),
    ).toBe(true);
  });

  it("returns false for non-adaptive monsters", () => {
    expect(
      isAdaptiveWeaponMonster(makeMonster({ type: MonsterType.MUTANT })),
    ).toBe(false);
    expect(
      isAdaptiveWeaponMonster(makeMonster({ type: MonsterType.SKULKER })),
    ).toBe(false);
  });
});

describe("isMonsterPrimaryWeapon", () => {
  it("returns true for valid weapons", () => {
    expect(isMonsterPrimaryWeapon(ItemType.PISTOL)).toBe(true);
    expect(isMonsterPrimaryWeapon(ItemType.BUTCHER_KNIFE)).toBe(true);
    expect(isMonsterPrimaryWeapon(ItemType.LASER_PISTOL)).toBe(true);
  });

  it("returns false for non-weapons", () => {
    expect(isMonsterPrimaryWeapon(ItemType.MEDKIT)).toBe(false);
    expect(isMonsterPrimaryWeapon(ItemType.AMMO)).toBe(false);
  });
});

describe("monsterWeaponScore", () => {
  it("returns the predefined score for scored items", () => {
    expect(monsterWeaponScore(ItemType.VIBRA_SWORD)).toBe(50);
    expect(monsterWeaponScore(ItemType.PISTOL)).toBe(20);
    expect(monsterWeaponScore(ItemType.LASER_PISTOL)).toBe(65);
  });

  it("returns 0 for non-scored items", () => {
    expect(monsterWeaponScore(ItemType.PICKAXE)).toBe(0);
    expect(monsterWeaponScore(ItemType.ROCK)).toBe(0);
    expect(monsterWeaponScore(ItemType.MEDKIT)).toBe(0);
  });
});

describe("equippedMonsterWeaponItem", () => {
  it("returns the equipped weapon for adaptive monsters", () => {
    const zyth = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.LASER_PISTOL,
    });
    expect(equippedMonsterWeaponItem(zyth)).toBe(ItemType.LASER_PISTOL);
  });

  it("defaults to PISTOL for adaptive monsters without equipped weapon", () => {
    const zyth = makeMonster({ type: MonsterType.ZYTH });
    expect(equippedMonsterWeaponItem(zyth)).toBe(ItemType.PISTOL);
  });

  it("defaults to PISTOL for non-adaptive ranged monsters", () => {
    const skulker = makeMonster({ type: MonsterType.SKULKER });
    expect(equippedMonsterWeaponItem(skulker)).toBe(ItemType.PISTOL);
  });

  it("defaults to BUTCHER_KNIFE for non-adaptive melee monsters", () => {
    const mutant = makeMonster({ type: MonsterType.MUTANT });
    expect(equippedMonsterWeaponItem(mutant)).toBe(ItemType.BUTCHER_KNIFE);
  });
});

describe("equippedMonsterWeaponType", () => {
  it("returns the correct WeaponType for the equipped weapon item", () => {
    expect(
      equippedMonsterWeaponType(
        makeMonster({
          type: MonsterType.ZYTH,
          equippedWeapon: ItemType.LASER_PISTOL,
        }),
      ),
    ).toBe(WeaponType.LASER);
    expect(
      equippedMonsterWeaponType(
        makeMonster({
          type: MonsterType.ZYTH,
          equippedWeapon: ItemType.GYROJET_SMG,
        }),
      ),
    ).toBe(WeaponType.SMG);
    expect(
      equippedMonsterWeaponType(
        makeMonster({
          type: MonsterType.ZYTH,
          equippedWeapon: ItemType.VIBRA_SWORD,
        }),
      ),
    ).toBe(WeaponType.MELEE);
    expect(
      equippedMonsterWeaponType(makeMonster({ type: MonsterType.MUTANT })),
    ).toBe(WeaponType.MELEE);
  });
});

describe("monsterCanUseEquippedWeapon", () => {
  it("returns true if monster has enough ammo for pistol", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.PISTOL,
      bullets: 1,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(true);
  });

  it("returns false if monster does not have enough ammo for pistol", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.PISTOL,
      bullets: 0,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(false);
  });

  it("returns true if monster has enough ammo for shotgun", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.GYROJET_SHOTGUN,
      bullets: MONSTER_SHOTGUN_AMMO_COST,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(true);
  });

  it("returns false if monster does not have enough ammo for shotgun", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.GYROJET_SHOTGUN,
      bullets: MONSTER_SHOTGUN_AMMO_COST - 1,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(false);
  });

  it("returns true if monster has enough charge for laser", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.LASER_PISTOL,
      laserCharge: MONSTER_LASER_SHOT_COST,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(true);
  });

  it("returns false if monster does not have enough charge for laser", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.LASER_PISTOL,
      laserCharge: MONSTER_LASER_SHOT_COST - 1,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(false);
  });

  it("returns true for melee weapons regardless of ammo", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      equippedWeapon: ItemType.VIBRA_SWORD,
      bullets: 0,
      laserCharge: 0,
    });
    expect(monsterCanUseEquippedWeapon(monster)).toBe(true);
  });
});

describe("monsterMeleeDamage", () => {
  it("returns max of monster dmg and weapon floor damage", () => {
    const weakMonster = makeMonster({ type: MonsterType.ZYTH, dmg: 2 });
    expect(
      monsterMeleeDamage({
        ...weakMonster,
        equippedWeapon: ItemType.VIBRA_SWORD,
      } as Monster),
    ).toBe(7);
    expect(
      monsterMeleeDamage({
        ...weakMonster,
        equippedWeapon: ItemType.MACRO_METAL_SWORD,
      } as Monster),
    ).toBe(5);
    expect(
      monsterMeleeDamage({
        ...weakMonster,
        equippedWeapon: ItemType.BUTCHER_KNIFE,
      } as Monster),
    ).toBe(3);

    const strongMonster = makeMonster({ type: MonsterType.ZYTH, dmg: 10 });
    expect(
      monsterMeleeDamage({
        ...strongMonster,
        equippedWeapon: ItemType.VIBRA_SWORD,
      } as Monster),
    ).toBe(10);
    expect(
      monsterMeleeDamage({
        ...strongMonster,
        equippedWeapon: ItemType.MACRO_METAL_SWORD,
      } as Monster),
    ).toBe(10);
    expect(
      monsterMeleeDamage({
        ...strongMonster,
        equippedWeapon: ItemType.BUTCHER_KNIFE,
      } as Monster),
    ).toBe(10);
  });

  it("returns base monster dmg for other items", () => {
    const monster = makeMonster({
      type: MonsterType.ZYTH,
      dmg: 4,
      equippedWeapon: ItemType.PISTOL,
    });
    expect(monsterMeleeDamage(monster)).toBe(4);
  });
});

describe("weapon ranking", () => {
  it("scores weapons in ascending order of desirability", () => {
    // Adaptive monsters swap only for a strictly higher score, so this ordering
    // is what makes a Zyth trade up rather than sideways.
    const ascending = [
      ItemType.PISTOL,
      ItemType.BUTCHER_KNIFE,
      ItemType.MACRO_METAL_SWORD,
      ItemType.GYROJET_SMG,
      ItemType.VIBRA_SWORD,
      ItemType.GYROJET_SHOTGUN,
      ItemType.LASER_PISTOL,
    ];

    for (let i = 1; i < ascending.length; i++) {
      expect(
        monsterWeaponScore(ascending[i]),
        `${ascending[i]} should outrank ${ascending[i - 1]}`,
      ).toBeGreaterThan(monsterWeaponScore(ascending[i - 1]));
    }
  });

  it("scores every ranked weapon above an unranked item", () => {
    expect(monsterWeaponScore(ItemType.PISTOL)).toBeGreaterThan(
      monsterWeaponScore(ItemType.ROCK),
    );
  });

  it("orders the melee damage floors the same way it scores them", () => {
    const monster = makeMonster({ type: MonsterType.ZYTH, dmg: 0 });
    const floorFor = (item: ItemType): number =>
      monsterMeleeDamage({ ...monster, equippedWeapon: item } as Monster);

    expect(floorFor(ItemType.VIBRA_SWORD)).toBeGreaterThan(
      floorFor(ItemType.MACRO_METAL_SWORD),
    );
    expect(floorFor(ItemType.MACRO_METAL_SWORD)).toBeGreaterThan(
      floorFor(ItemType.BUTCHER_KNIFE),
    );
  });
});
