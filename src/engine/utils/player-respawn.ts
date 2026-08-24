/**
 * Death inventory rules shared by offline simulation and the authoritative
 * multiplayer server. Ordinary carried items become world entities at the
 * death position; the CTDM and Matter Manipulator remain attached to the
 * character and are never represented as dropped loot.
 */

import {
  GameState,
  ItemType,
  Player,
  STACKABLE_ITEMS,
  WeaponType,
} from "../types";
import { ItemEntity } from "../entities/item-entity";

const CORE_DEVICE_TYPES = new Set<ItemType>([
  ItemType.CTDM,
  ItemType.MATTER_MANIPULATOR,
]);

function isCoreDevice(type: ItemType): boolean {
  return CORE_DEVICE_TYPES.has(type);
}

function stackableQuantity(player: Player, type: ItemType): number {
  switch (type) {
    case ItemType.AMMO:
      // Loaded rounds are still carried equipment and become loose ammo too.
      return Math.max(0, Math.floor(player.ammo + player.ammoReserve));
    case ItemType.GRENADE:
      return Math.max(0, Math.floor(player.grenades));
    case ItemType.LAND_MINE:
      return Math.max(0, Math.floor(player.landMines));
    case ItemType.KEYCARD:
      return Math.max(0, Math.floor(player.keys));
    default:
      return Math.max(0, Math.floor(player.itemCounts[type] ?? 0));
  }
}

function spawnDrop(
  state: GameState,
  player: Player,
  type: ItemType,
  amount?: number,
): void {
  const item = new ItemEntity(player.gridX, player.gridY, type, amount);
  item.worldX = player.worldX;
  item.worldY = player.worldY;
  item.prevWorldX = item.worldX;
  item.prevWorldY = item.worldY;
  item.deathDrop = true;
  state.entityManager.spawn(item);
}

/**
 * Drop all ordinary inventory exactly once and clear the death-lost state.
 * Returns the number of spawned world items.
 */
export function dropPlayerInventoryOnDeath(
  state: GameState,
  player: Player,
): number {
  if (player.inventoryDroppedOnDeath) return 0;

  const slotTypes = new Map<ItemType, number>();
  for (const slot of player.inventorySlots) {
    if (!slot.type || isCoreDevice(slot.type)) continue;
    slotTypes.set(slot.type, (slotTypes.get(slot.type) ?? 0) + 1);
  }

  let dropped = 0;
  for (const type of STACKABLE_ITEMS) {
    if (!slotTypes.has(type) && (player.itemCounts[type] ?? 0) <= 0) {
      if (
        type !== ItemType.AMMO &&
        type !== ItemType.GRENADE &&
        type !== ItemType.LAND_MINE &&
        type !== ItemType.KEYCARD
      ) {
        continue;
      }
    }

    const quantity = stackableQuantity(player, type);
    if (quantity <= 0) continue;

    if (type === ItemType.AMMO) {
      spawnDrop(state, player, type, quantity);
      dropped += 1;
    } else {
      for (let i = 0; i < quantity; i++) {
        spawnDrop(state, player, type, 1);
        dropped += 1;
      }
    }
  }

  for (const [type, count] of slotTypes) {
    if (STACKABLE_ITEMS.includes(type)) continue;
    for (let i = 0; i < count; i++) {
      spawnDrop(state, player, type);
      dropped += 1;
    }
  }

  const retainedCoreTypes = new Set<ItemType>();
  if (
    player.hasCTDM ||
    player.inventorySlots.some((slot) => slot.type === ItemType.CTDM)
  ) {
    player.hasCTDM = true;
    retainedCoreTypes.add(ItemType.CTDM);
  }
  if (
    player.hasMatterManipulator ||
    player.inventorySlots.some(
      (slot) => slot.type === ItemType.MATTER_MANIPULATOR,
    )
  ) {
    player.hasMatterManipulator = true;
    retainedCoreTypes.add(ItemType.MATTER_MANIPULATOR);
  }

  player.inventorySlots = player.inventorySlots.map((slot) =>
    slot.type && retainedCoreTypes.has(slot.type)
      ? { type: slot.type }
      : { type: null },
  );
  for (const type of retainedCoreTypes) {
    if (player.inventorySlots.some((slot) => slot.type === type)) continue;
    const empty = player.inventorySlots.find((slot) => slot.type === null);
    if (empty) empty.type = type;
  }

  player.itemCounts = {};
  player.ammo = 0;
  player.ammoReserve = 0;
  player.grenades = 0;
  player.keys = 0;
  player.landMines = 0;
  player.armor = 0;
  player.laserCharge = 0;
  player.panicCharge = 0;
  player.weapon = WeaponType.MELEE;
  player.selectedBarSlot = 0;
  player.ctdmEnabled = false;
  player.matterManipulatorActive = false;
  player.inventoryDroppedOnDeath = true;

  return dropped;
}
