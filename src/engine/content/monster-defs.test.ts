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
});
