import { EntityKind, ItemType, MonsterType } from "../types";
import { GameEntity } from "./GameEntity";
import { RNG } from "../utils/RNG";

/**
 * Represents monsters
 */
export class MonsterEntity extends GameEntity {
  /** Entity type identifier */
  public readonly kind = EntityKind.MONSTER;

  /** Max health points */
  public hpMax: number;

  /** Damage dealt per attack */
  public dmg: number;

  /** Current health points */
  public hp: number;

  /** Number of grenades carried */
  public grenades: number;

  /** Number of land mines carried */
  public landMines: number;

  /** Items carried beyond direct counters */
  public carriedItems: { type: ItemType; amount?: number; heal?: number }[];

  /** Monster type (mutant, rat, etc.) */
  public type: MonsterType;

  constructor(gridX: number, gridY: number, type: MonsterType, depth: number) {
    super(gridX, gridY);

    this.type = type;
    this.hpMax = 6 + depth;
    this.hp = this.hpMax;
    this.dmg = 2 + Math.floor(depth / 2);
    this.grenades = RNG.chance(0.12) ? 1 : 0;
    this.landMines = this.grenades === 0 && RNG.chance(0.08) ? 1 : 0;
    this.carriedItems = [];
    this.nextActTick = 0;
  }
}
