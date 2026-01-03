import { Monster, EntityKind, MonsterType } from "../types";

let nextMonsterId = 2000; // Start monster IDs at 2000

/**
 * Create a mutant enemy
 */
export function createMutant(x: number, y: number, depth: number): Monster {
  return {
    id: nextMonsterId++,
    kind: EntityKind.MONSTER,
    type: MonsterType.MUTANT,
    x,
    y,
    hp: 6 + depth,
    dmg: 2 + Math.floor(depth / 2),
    nextActTick: 0,
  };
}

/**
 * Create a rat enemy
 */
export function createRat(x: number, y: number, depth: number): Monster {
  return {
    id: nextMonsterId++,
    kind: EntityKind.MONSTER,
    type: MonsterType.RAT,
    x,
    y,
    hp: 6 + depth,
    dmg: 2 + Math.floor(depth / 2),
    nextActTick: 0,
  };
}
