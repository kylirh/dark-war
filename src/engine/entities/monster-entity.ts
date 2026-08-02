import { AgentComponent, EntityKind, ItemType, MonsterType } from "../types";
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

  /** Primary weapon equipped by Zyths and Terrorist Collaborators. */
  public equippedWeapon?: ItemType;

  /** Remaining charge for an equipped laser pistol. */
  public laserCharge?: number;

  /** Items carried beyond direct counters */
  public carriedItems: { type: ItemType; amount?: number; heal?: number }[];

  /** Monster type (mutant, rat, etc.) */
  public type: MonsterType;

  /** Alert level 0–100; decays when player is out of sight */
  public alertLevel: number = 0;

  /** Last known player world position for investigation */
  public lastKnownPlayerX: number = 0;
  public lastKnownPlayerY: number = 0;

  /** Most recent simulation tick when this monster was damaged by a player. */
  public lastPlayerAttackTick?: number;

  /** Mutants stop to digest until this simulation tick. */
  public digestingUntilTick?: number;

  /** Befriended pet state (e.g. a dog given a bone). */
  public friendly?: boolean;
  public ownerId?: string;
  public name?: string;

  /** Current pursuit target used to pace Wild Dog vocalizations. */
  public dogVocalTargetId?: string;

  /** Simulation tick of this Wild Dog's most recent vocalization. */
  public lastDogVocalTick?: number;

  /** Simulation tick of this friendly dog's most recent whimper. */
  public lastDogWhimperTick?: number;

  /** Simulation tick of this Snagglepuss's most recent ambient mutter. */
  public lastSnagglepussMutterTick?: number;

  /** Whether this Giant Spider was within ambient-audio range last update. */
  public spiderAmbienceNearby?: boolean;

  /** Simulation tick of this Giant Spider's most recent ambient sound. */
  public lastSpiderAmbienceTick?: number;

  /** Whether this Icky Lump was approaching within audio range last update. */
  public ickyLumpMovementNearby?: boolean;

  /** Simulation tick of this Icky Lump's most recent movement sound. */
  public lastIckyLumpMovementTick?: number;

  /** Simulation tick when this Dreadnaught should next emit ambience. */
  public nextDreadnaughtAmbienceTick?: number;

  /** Simulation tick when this Flutterbang should next emit ambience. */
  public nextFlutterbangAmbienceTick?: number;

  /** A thief that grabbed loot and is now running away. */
  public fleeing?: boolean;

  /** Persisted goal-selection state shared by all simulated creatures. */
  public agent: AgentComponent = {
    decisionEpoch: 0,
    nextDecisionTick: 0,
    currentGoal: "idle",
  };

  constructor(gridX: number, gridY: number, type: MonsterType, depth: number) {
    super(gridX, gridY);

    this.type = type;

    if (type === MonsterType.SNAGGLEPUSS) {
      this.social = { defId: "wildlife.snagglepuss" };
      this.interactable = { affordances: ["talk"] };
    }

    const def = MONSTER_DEFS[type];
    this.hpMax = monsterHpAt(type, depth);
    this.dmg = monsterDmgAt(type, depth);
    this.grenades = 0;
    this.landMines = 0;
    this.bullets = 0;

    if (
      type === MonsterType.ZYTH ||
      type === MonsterType.TERRORIST_COLLABORATOR
    ) {
      this.equippedWeapon = ItemType.PISTOL;
      this.laserCharge = 0;
    }

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
