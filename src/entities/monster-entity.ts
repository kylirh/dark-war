import { EntityKind, ItemType, MonsterType } from "../types";
import { GameEntity } from "./game-entity";
import { RNG } from "../utils/rng";
import {
  MONSTER_DEFS,
  monsterHpAt,
  monsterDmgAt,
} from "../content/monster-defs";

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

  /** Number of bullets carried (skulkers only) */
  public bullets: number;

  /** Items carried beyond direct counters */
  public carriedItems: { type: ItemType; amount?: number; heal?: number }[];

  /** Monster type (mutant, rat, etc.) */
  public type: MonsterType;

  /** Alert level 0–100; decays when player is out of sight */
  public alertLevel: number = 0;

  /** Last known player world position for investigation */
  public lastKnownPlayerX: number = 0;
  public lastKnownPlayerY: number = 0;

  constructor(gridX: number, gridY: number, type: MonsterType, depth: number) {
    super(gridX, gridY);

    this.type = type;

    const def = MONSTER_DEFS[type];
    this.hpMax = monsterHpAt(type, depth);
    this.dmg = monsterDmgAt(type, depth);
    this.grenades = 0;
    this.landMines = 0;
    this.bullets = 0;

    // Some creatures (wild dog, icky lump) never carry weapons or items.
    if (!def.flags?.cannotCarryItems) {
      if (def.behavior === "ranged") {
        const [lo, hi] = def.flags?.rangedBullets ?? [3, 8];
        this.bullets = lo + RNG.int(Math.max(1, hi - lo + 1));
        this.grenades = RNG.chance(0.45) ? 1 : 0;
      } else if (def.behavior === "melee") {
        this.grenades = RNG.chance(0.12) ? 1 : 0;
        this.landMines = this.grenades === 0 && RNG.chance(0.08) ? 1 : 0;
      }
    }

    this.hp = this.hpMax;
    this.carriedItems = [];
    this.nextActTick = 0;
  }
}
