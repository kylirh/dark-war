import { ItemType, MonsterType } from "../types";

/**
 * Data-driven monster definitions. `MonsterEntity` reads stats from here, the
 * spawner builds depth-gated weighted tables from here, and the AI reads the
 * `behavior` archetype + `flags` to pick conduct. New creatures are introduced
 * as reskinned archetypes first; bespoke abilities are layered on via `flags`
 * and handled incrementally in the simulation (see .github/copilot-instructions.md).
 */

/** Which base AI archetype drives the creature. */
export type MonsterBehavior = "melee" | "ranged" | "bot";

export interface MonsterLoot {
  type: ItemType;
  chance: number; // 0..1
  amount?: number;
}

export interface MonsterFlags {
  /** Ranged creatures spawn with bullets in this [min,max] range. */
  rangedBullets?: [number, number];
  /** Multiplies/breeds into nearby empty tiles over time (icky lump). */
  breeds?: boolean;
  /** May detonate like a grenade on/after a bite (flutterbang). */
  explodes?: boolean;
  /** Chance to stun + slow the player on a successful hit (giant spider). */
  stunsOnHit?: boolean;
  /** Rendered nearly invisible while engaging (cybercop). */
  invisible?: boolean;
  /** Steals an item/coins then flees/teleports (snagglepuss/moppet). */
  steals?: "item" | "money";
  /** Teleports away when hit (moppet). */
  teleportsOnHit?: boolean;
  /** Notices the player from across the level (moppet). */
  farSight?: boolean;
  /** Slowly regenerates HP (moppet). */
  selfHeals?: boolean;
  /** Smashes through walls to reach the player (dreadnaught). */
  destroysWalls?: boolean;
  /** Can be befriended by giving this item; then fights for the player. */
  allyItem?: ItemType;
  /** Strikes this many times per attack (tentacular horror). */
  multiHit?: number;
  /** Won't fight others of its own kind (icky lump). */
  pacifistToOwnKind?: boolean;
  /** Never spawns with or picks up weapons/items (wild dog, icky lump). */
  cannotCarryItems?: boolean;
}

export interface MonsterDef {
  /** SPRITE_COORDS key (defaults to the MonsterType value). */
  spriteKey?: string;
  behavior: MonsterBehavior;
  baseHp: number;
  hpPerDepth: number;
  baseDmg: number;
  dmgPerDepth: number;
  /** Movement speed multiplier vs the default actor speed (1 = normal). */
  speed: number;
  // Spawn tuning
  minDepth: number;
  weight: number; // relative weight in the random pool (0 = not pooled)
  miniboss?: boolean; // spawn at most one, gated to deep floors
  flags?: MonsterFlags;
  loot?: MonsterLoot[];
}

/** hp/dmg are `base + floor(depth * perDepth)` to match the original scaling. */
export const MONSTER_DEFS: Record<MonsterType, MonsterDef> = {
  [MonsterType.MUTANT]: {
    behavior: "melee",
    baseHp: 6,
    hpPerDepth: 1,
    baseDmg: 2,
    dmgPerDepth: 0.5,
    speed: 1,
    minDepth: 1,
    weight: 5,
  },
  [MonsterType.RAT]: {
    behavior: "melee",
    baseHp: 6,
    hpPerDepth: 1,
    baseDmg: 2,
    dmgPerDepth: 0.5,
    speed: 1.15,
    minDepth: 1,
    weight: 3,
  },
  [MonsterType.SKULKER]: {
    behavior: "ranged",
    baseHp: 3,
    hpPerDepth: 0.5,
    baseDmg: 1,
    dmgPerDepth: 0,
    speed: 1,
    minDepth: 1,
    weight: 2,
    flags: { rangedBullets: [3, 8] },
  },
  [MonsterType.UTILITY_BOT]: {
    behavior: "bot",
    baseHp: 20,
    hpPerDepth: 2,
    baseDmg: 4,
    dmgPerDepth: 0,
    speed: 1,
    minDepth: 1,
    weight: 0, // spawned explicitly, not from the random pool
    loot: [{ type: ItemType.METAL_SCRAPS, chance: 1 }],
  },

  // ---- new creatures ----
  [MonsterType.GIANT_SPIDER]: {
    behavior: "melee",
    baseHp: 8,
    hpPerDepth: 1,
    baseDmg: 3,
    dmgPerDepth: 0.5,
    speed: 1.1,
    minDepth: 2,
    weight: 5,
    flags: { stunsOnHit: true },
    loot: [{ type: ItemType.BONE, chance: 0.25 }],
  },
  [MonsterType.WILD_DOG]: {
    behavior: "melee",
    baseHp: 7,
    hpPerDepth: 1,
    baseDmg: 2,
    dmgPerDepth: 0.3,
    speed: 1.25,
    minDepth: 1,
    weight: 4,
    flags: { allyItem: ItemType.BONE, cannotCarryItems: true },
    loot: [{ type: ItemType.BONE, chance: 0.15 }],
  },
  [MonsterType.ICKY_LUMP]: {
    behavior: "melee",
    baseHp: 5,
    hpPerDepth: 0.5,
    baseDmg: 1,
    dmgPerDepth: 0,
    speed: 0.55,
    minDepth: 1,
    weight: 4,
    flags: { breeds: true, pacifistToOwnKind: true, cannotCarryItems: true },
    loot: [{ type: ItemType.COIN, chance: 0.35 }],
  },
  [MonsterType.SNAGGLEPUSS]: {
    behavior: "melee",
    baseHp: 6,
    hpPerDepth: 0.5,
    baseDmg: 1,
    dmgPerDepth: 0.25,
    speed: 1.3,
    minDepth: 2,
    weight: 3,
    flags: { steals: "item", allyItem: ItemType.COOKIE },
  },
  [MonsterType.FLUTTERBANG]: {
    behavior: "melee",
    baseHp: 4,
    hpPerDepth: 0.5,
    baseDmg: 2,
    dmgPerDepth: 0.25,
    speed: 1.6,
    minDepth: 3,
    weight: 4,
    flags: { explodes: true },
  },
  [MonsterType.MOPPET]: {
    behavior: "melee",
    baseHp: 6,
    hpPerDepth: 0.5,
    baseDmg: 1,
    dmgPerDepth: 0.25,
    speed: 1.2,
    minDepth: 3,
    weight: 3,
    flags: {
      steals: "money",
      teleportsOnHit: true,
      farSight: true,
      selfHeals: true,
    },
  },
  [MonsterType.CYBERCOP]: {
    behavior: "melee",
    baseHp: 14,
    hpPerDepth: 2,
    baseDmg: 5,
    dmgPerDepth: 0.5,
    speed: 1.1,
    minDepth: 4,
    weight: 2,
    flags: { invisible: true },
  },
  [MonsterType.ZYTH]: {
    behavior: "ranged",
    baseHp: 10,
    hpPerDepth: 1,
    baseDmg: 3,
    dmgPerDepth: 0.5,
    speed: 1,
    minDepth: 4,
    weight: 3,
    flags: { rangedBullets: [4, 9] },
  },
  [MonsterType.TENTACULAR_HORROR]: {
    behavior: "melee",
    baseHp: 40,
    hpPerDepth: 5,
    baseDmg: 6,
    dmgPerDepth: 1,
    speed: 0.85,
    minDepth: 6,
    weight: 1,
    flags: { multiHit: 3 },
  },
  [MonsterType.TERRORIST_COLLABORATOR]: {
    behavior: "ranged",
    baseHp: 30,
    hpPerDepth: 3,
    baseDmg: 4,
    dmgPerDepth: 0.5,
    speed: 1,
    minDepth: 6,
    weight: 0,
    miniboss: true,
    flags: { rangedBullets: [6, 12] },
  },
  [MonsterType.DREADNAUGHT]: {
    behavior: "melee",
    baseHp: 60,
    hpPerDepth: 5,
    baseDmg: 8,
    dmgPerDepth: 1,
    speed: 0.8,
    minDepth: 7,
    weight: 0,
    miniboss: true,
    flags: { destroysWalls: true, farSight: true },
    loot: [{ type: ItemType.METAL_SCRAPS, chance: 1, amount: 3 }],
  },
};

export function monsterHpAt(type: MonsterType, depth: number): number {
  const d = MONSTER_DEFS[type];
  return Math.max(1, d.baseHp + Math.floor(depth * d.hpPerDepth));
}

export function monsterDmgAt(type: MonsterType, depth: number): number {
  const d = MONSTER_DEFS[type];
  return Math.max(1, d.baseDmg + Math.floor(depth * d.dmgPerDepth));
}

/** True if the creature uses the ranged (skulker-style) combat archetype. */
export function isRangedMonster(type: MonsterType): boolean {
  return MONSTER_DEFS[type].behavior === "ranged";
}
