import { EntityKind, MonsterType } from "../types";
import { ContinuousEntity } from "./ContinuousEntity";
import { RNG } from "../utils/RNG";

let nextMonsterId = 2000; // Start monster IDs at 2000

/**
 * Monster entity with continuous world coordinates
 */
export class MonsterEntity extends ContinuousEntity {
  public readonly kind = EntityKind.MONSTER;

  public type: MonsterType;
  public hp: number;
  public dmg: number;
  public grenades: number;
  public landMines: number;

  constructor(gridX: number, gridY: number, type: MonsterType, depth: number) {
    super(nextMonsterId++, gridX, gridY);

    this.type = type;
    this.hp = 6 + depth;
    this.dmg = 2 + Math.floor(depth / 2);
    this.grenades = RNG.chance(0.12) ? 1 : 0;
    this.landMines = this.grenades === 0 && RNG.chance(0.08) ? 1 : 0;
    this.nextActTick = 0;
  }
}

/**
 * Create a mutant enemy (factory function for backward compatibility)
 */
export function createMutant(
  x: number,
  y: number,
  depth: number,
): MonsterEntity {
  return new MonsterEntity(x, y, MonsterType.MUTANT, depth);
}

/**
 * Create a rat enemy (factory function for backward compatibility)
 */
export function createRat(x: number, y: number, depth: number): MonsterEntity {
  return new MonsterEntity(x, y, MonsterType.RAT, depth);
}
