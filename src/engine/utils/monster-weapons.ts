/**
 * Shared weapon-selection rules for monsters that can evaluate, equip, and use
 * the same primary weapons as the player.
 */

import { ITEM_DEFS } from "../content/item-defs";
import { isRangedMonster } from "../content/monster-defs";
import { ItemType, Monster, MonsterType, WeaponType } from "../types";
import { weaponTypeForItem } from "./inventory";

export const MONSTER_LASER_CHARGE_MAX = 100;
export const MONSTER_LASER_SHOT_COST = 5;
export const MONSTER_SHOTGUN_AMMO_COST = 4;

const WEAPON_SCORES: Partial<Record<ItemType, number>> = {
  [ItemType.PISTOL]: 20,
  [ItemType.BUTCHER_KNIFE]: 25,
  [ItemType.MACRO_METAL_SWORD]: 35,
  [ItemType.GYROJET_SMG]: 45,
  [ItemType.VIBRA_SWORD]: 50,
  [ItemType.GYROJET_SHOTGUN]: 55,
  [ItemType.LASER_PISTOL]: 65,
};

/** Whether this monster species can evaluate and swap primary weapons. */
export function isAdaptiveWeaponMonster(monster: Monster): boolean {
  return (
    monster.type === MonsterType.ZYTH ||
    monster.type === MonsterType.TERRORIST_COLLABORATOR
  );
}

/** Whether an item is an equippable primary weapon for adaptive monsters. */
export function isMonsterPrimaryWeapon(itemType: ItemType): boolean {
  const category = ITEM_DEFS[itemType].category;
  return category === "weapon-melee" || category === "weapon-ranged";
}

/** Combat-value score used when deciding whether a newly found weapon is better. */
export function monsterWeaponScore(itemType: ItemType): number {
  return WEAPON_SCORES[itemType] ?? 0;
}

/** Current equipped item, including the pistol default for older saved games. */
export function equippedMonsterWeaponItem(monster: Monster): ItemType {
  if (isAdaptiveWeaponMonster(monster)) {
    return monster.equippedWeapon ?? ItemType.PISTOL;
  }
  return isRangedMonster(monster.type)
    ? ItemType.PISTOL
    : ItemType.BUTCHER_KNIFE;
}

/** Current primary attack mode used by monster AI. */
export function equippedMonsterWeaponType(monster: Monster): WeaponType {
  return weaponTypeForItem(equippedMonsterWeaponItem(monster));
}

/** Whether the equipped primary weapon has enough ammunition or charge to fire. */
export function monsterCanUseEquippedWeapon(monster: Monster): boolean {
  switch (equippedMonsterWeaponType(monster)) {
    case WeaponType.PISTOL:
    case WeaponType.SMG:
      return monster.bullets > 0;
    case WeaponType.SHOTGUN:
      return monster.bullets >= MONSTER_SHOTGUN_AMMO_COST;
    case WeaponType.LASER:
      return (monster.laserCharge ?? 0) >= MONSTER_LASER_SHOT_COST;
    case WeaponType.MELEE:
      return true;
    default:
      return false;
  }
}

/** Damage for an adaptive monster's equipped melee weapon. */
export function monsterMeleeDamage(monster: Monster): number {
  switch (equippedMonsterWeaponItem(monster)) {
    case ItemType.VIBRA_SWORD:
      return Math.max(monster.dmg, 7);
    case ItemType.MACRO_METAL_SWORD:
      return Math.max(monster.dmg, 5);
    case ItemType.BUTCHER_KNIFE:
      return Math.max(monster.dmg, 3);
    default:
      return monster.dmg;
  }
}
