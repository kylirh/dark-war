/**
 * Coverage for the monster-definition table and its stat-scaling helpers.
 *
 * MONSTER_DEFS is the single source of truth for spawning, AI archetype
 * selection and rendering, so the tests pin both the table's completeness and
 * the depth-scaling curves that balance depends on.
 */

import { describe, it, expect } from "vitest";
import {
  MONSTER_DEFS,
  monsterHpAt,
  monsterDmgAt,
  isRangedMonster,
} from "./monster-defs";
import { MonsterType } from "../types";
import { SPRITE_COORDS } from "../config/sprites";

describe("monster definitions", () => {
  it("defines every MonsterType", () => {
    for (const type of Object.values(MonsterType)) {
      expect(MONSTER_DEFS[type]).toBeDefined();
      // and has a sprite (so it can render)
      expect(SPRITE_COORDS[type]).toBeDefined();
    }
  });

  it("reproduces the original stat scaling for legacy monsters", () => {
    // Mutant: 6 + depth hp, 2 + floor(depth/2) dmg
    expect(monsterHpAt(MonsterType.MUTANT, 1)).toBe(7);
    expect(monsterHpAt(MonsterType.MUTANT, 8)).toBe(14);
    expect(monsterDmgAt(MonsterType.MUTANT, 8)).toBe(6);
    // Skulker: 3 + floor(depth/2) hp
    expect(monsterHpAt(MonsterType.SKULKER, 4)).toBe(5);
    // Utility bot: 20 + 2*depth hp, more than a skulker
    expect(monsterHpAt(MonsterType.UTILITY_BOT, 3)).toBe(26);
    expect(monsterHpAt(MonsterType.UTILITY_BOT, 3)).toBeGreaterThan(
      monsterHpAt(MonsterType.SKULKER, 3),
    );
  });

  it("classifies ranged creatures", () => {
    expect(isRangedMonster(MonsterType.SKULKER)).toBe(true);
    expect(isRangedMonster(MonsterType.ZYTH)).toBe(true);
    expect(isRangedMonster(MonsterType.TERRORIST_COLLABORATOR)).toBe(true);
    expect(isRangedMonster(MonsterType.MUTANT)).toBe(false);
    expect(isRangedMonster(MonsterType.DREADNAUGHT)).toBe(false);
  });

  it("keeps icky lumps at roughly half of their former health curve", () => {
    expect(monsterHpAt(MonsterType.ICKY_LUMP, 1)).toBe(2.5);
    expect(monsterHpAt(MonsterType.ICKY_LUMP, 8)).toBe(4.5);
  });

  it("gates minibosses and tough monsters to lower levels", () => {
    expect(MONSTER_DEFS[MonsterType.DREADNAUGHT].miniboss).toBe(true);
    expect(
      MONSTER_DEFS[MonsterType.DREADNAUGHT].minDepth,
    ).toBeGreaterThanOrEqual(6);
    expect(
      MONSTER_DEFS[MonsterType.TENTACULAR_HORROR].minDepth,
    ).toBeGreaterThanOrEqual(6);
    // Tougher than a mutant at the same depth.
    expect(monsterHpAt(MonsterType.TENTACULAR_HORROR, 6)).toBeGreaterThan(
      monsterHpAt(MonsterType.MUTANT, 6),
    );
  });

  it("enforces a minimum HP floor of 1", () => {
    // If a monster has very low health scaling, or we check a negative depth, it shouldn't drop below 1
    // (though depth is usually >= 1, we test the pure function's robustness)
    expect(monsterHpAt(MonsterType.ICKY_LUMP, -100)).toBe(1); // 2.5 + (-100 * 0.25) = -22.5 -> 1
    expect(monsterHpAt(MonsterType.MUTANT, -10)).toBe(1); // 6 + (-10 * 1) = -4 -> 1
  });

  it("enforces a minimum DMG floor of 0.5", () => {
    // A workshop builder has baseDmg 0 and dmgPerDepth 0, but the function caps minimum at 0.5
    expect(monsterDmgAt(MonsterType.WORKSHOP_BUILDER, 1)).toBe(0.5);
    // ICKY_LUMP has 0.5 base, 0 per depth
    expect(monsterDmgAt(MonsterType.ICKY_LUMP, 10)).toBe(0.5);

    // Test negative depth bounds
    expect(monsterDmgAt(MonsterType.MUTANT, -100)).toBe(0.5);
  });

  it("calculates stats correctly at depth 0", () => {
    // depth 0 should just return base stats (or floor if base is lower than floor)
    expect(monsterHpAt(MonsterType.MUTANT, 0)).toBe(6);
    expect(monsterDmgAt(MonsterType.MUTANT, 0)).toBe(2);

    expect(monsterHpAt(MonsterType.WORKSHOP_BUILDER, 0)).toBe(40);
    expect(monsterDmgAt(MonsterType.WORKSHOP_BUILDER, 0)).toBe(0.5); // baseDmg 0, max(0.5, 0)
  });

  it("fails loudly rather than silently defaulting for an unknown type", () => {
    // The helpers dereference MONSTER_DEFS[type] with no fallback, by design:
    // a monster missing from the table is a content bug that should surface at
    // spawn time, not spawn a 1 HP creature nobody notices.
    const invalidType = "NOT_A_REAL_MONSTER" as MonsterType;
    expect(() => monsterHpAt(invalidType, 1)).toThrowError(TypeError);
    expect(() => monsterDmgAt(invalidType, 1)).toThrowError(TypeError);
    expect(() => isRangedMonster(invalidType)).toThrowError(TypeError);
  });
});
