import { describe, it, expect } from "vitest";
import { MonsterEntity } from "./monster-entity";
import { EntityKind, MonsterType } from "../types";

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
});
