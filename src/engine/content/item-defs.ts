import { ItemType } from "../types";

/**
 * Data-driven item metadata. Display names, categories, and behavior flags for
 * every item. Mechanics (firing modes, consumption, cleanup, economy) read these
 * flags; see docs/ROADMAP.md for what's wired vs. pending.
 */

export type ItemCategory =
  | "weapon-melee"
  | "weapon-ranged"
  | "ammo"
  | "armor"
  | "consumable"
  | "throwable"
  | "currency"
  | "junk" // cleaned up by the utility bot, otherwise inert (for now)
  | "utility"
  | "machine"
  | "key"
  | "special";

export interface ItemDef {
  name: string;
  category: ItemCategory;
  /** SPRITE_COORDS key (defaults to the ItemType value). */
  spriteKey?: string;
  /** Can be found scattered in levels (vs. starter-only / drop-only). */
  findable?: boolean;
  /** Utility bots path to and remove these from the floor. */
  cleanedByBot?: boolean;
  /** Eating/using consumes it (cookie heals, black pill kills). */
  consumable?: boolean;
  /** Stacks as a count rather than occupying a unique slot. */
  stackable?: boolean;
}

export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  [ItemType.PISTOL]: {
    name: "Gyrojet Pistol",
    category: "weapon-ranged",
    findable: true,
  },
  [ItemType.AMMO]: {
    name: "Gyrojets",
    category: "ammo",
    findable: true,
    stackable: true,
  },
  [ItemType.MEDKIT]: { name: "Medkit", category: "consumable", findable: true },
  [ItemType.KEYCARD]: {
    name: "Keycard",
    category: "key",
    findable: true,
    stackable: true,
  },
  [ItemType.GRENADE]: {
    name: "Grenade",
    category: "throwable",
    findable: true,
    stackable: true,
  },
  [ItemType.LAND_MINE]: {
    name: "Land Mine",
    category: "throwable",
    findable: true,
    stackable: true,
  },
  [ItemType.CTDM]: { name: "CTDM Module", category: "special" },
  [ItemType.POWERCELL]: {
    name: "Powercell",
    category: "utility",
    findable: true,
    stackable: true,
  },

  // Weapons
  [ItemType.BUTCHER_KNIFE]: { name: "Butcher Knife", category: "weapon-melee" },
  [ItemType.LASER_PISTOL]: {
    name: "Laser Pistol",
    category: "weapon-ranged",
    findable: true,
  },
  [ItemType.GYROJET_SMG]: {
    name: "Gyrojet SMG",
    category: "weapon-ranged",
    findable: true,
  },
  [ItemType.GYROJET_SHOTGUN]: {
    name: "Gyrojet Shotgun",
    category: "weapon-ranged",
    findable: true,
  },
  [ItemType.MACRO_METAL_SWORD]: {
    name: "Macro Metal Sword",
    category: "weapon-melee",
    findable: true,
  },
  [ItemType.VIBRA_SWORD]: {
    name: "Vibra Sword",
    category: "weapon-melee",
    findable: true,
  },

  // Gear / utility
  [ItemType.MACROMETAL_JACKET]: {
    name: "Macrometal Jacket",
    category: "armor",
    findable: true,
  },
  [ItemType.PANIC_BUTTON]: {
    name: "Panic Button",
    category: "utility",
    findable: true,
  },
  [ItemType.HOLOWALL]: {
    name: "Holowall",
    category: "utility",
    findable: true,
    stackable: true,
  },

  // Consumables / economy / drops
  [ItemType.BONE]: { name: "Bone", category: "consumable", stackable: true },
  [ItemType.COOKIE]: {
    name: "Cookie",
    category: "consumable",
    findable: true,
    consumable: true,
    stackable: true,
  },
  [ItemType.BLACK_PILL]: {
    name: "Black Pill",
    category: "consumable",
    consumable: true,
  },
  [ItemType.COIN]: {
    name: "Coin",
    category: "currency",
    findable: true,
    stackable: true,
  },
  [ItemType.ROCK]: {
    name: "Rock",
    category: "throwable",
    findable: true,
    cleanedByBot: true,
    stackable: true,
  },
  [ItemType.RUBBLE_CHUNK]: {
    name: "Rubble",
    category: "junk",
    cleanedByBot: true,
    stackable: true,
  },
  [ItemType.TRASH]: {
    name: "Trash",
    category: "junk",
    findable: true,
    cleanedByBot: true,
    stackable: true,
  },
  [ItemType.METAL_SCRAPS]: {
    name: "Metal Scraps",
    category: "junk",
    cleanedByBot: true,
    stackable: true,
  },
  [ItemType.VENDING_MACHINE]: { name: "Vending Machine", category: "machine" },
};

export function itemName(type: ItemType): string {
  return ITEM_DEFS[type]?.name ?? String(type);
}

export function isJunk(type: ItemType): boolean {
  return ITEM_DEFS[type]?.cleanedByBot === true;
}
