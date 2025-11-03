import { Monster, EntityKind, MonsterType } from "../types";

/**
 * Create a mutant enemy
 */
export function createMutant(x: number, y: number, depth: number): Monster {
  return {
    kind: EntityKind.MONSTER,
    type: MonsterType.MUTANT,
    x,
    y,
    ch: "M",
    color: "#ff9f9f",
    hp: 6 + depth,
    dmg: 2 + Math.floor(depth / 2),
  };
}

/**
 * Create a rat enemy
 */
export function createRat(x: number, y: number, depth: number): Monster {
  return {
    kind: EntityKind.MONSTER,
    type: MonsterType.RAT,
    x,
    y,
    ch: "R",
    color: "#ff6b6b",
    hp: 6 + depth,
    dmg: 2 + Math.floor(depth / 2),
  };
}
