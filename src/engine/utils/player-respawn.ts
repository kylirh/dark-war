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
  STACKABLE_ITEMS_SET,
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
    if (STACKABLE_ITEMS_SET.has(type)) continue;
    for (let i = 0; i < count; i++) {
      spawnDrop(state, player, type);
      dropped += 1;
    }
  }

  let hasCtdmInSlot = false;
  let hasMatterManipulatorInSlot = false;

  const slots = player.inventorySlots;
  const len = slots.length;

  for (let i = 0; i < len; i++) {
    const type = slots[i].type;
    if (type === ItemType.CTDM) hasCtdmInSlot = true;
    else if (type === ItemType.MATTER_MANIPULATOR)
      hasMatterManipulatorInSlot = true;
  }

  const keepCtdm = player.hasCTDM || hasCtdmInSlot;
  const keepMm = player.hasMatterManipulator || hasMatterManipulatorInSlot;

  if (keepCtdm) player.hasCTDM = true;
  if (keepMm) player.hasMatterManipulator = true;

  let nextEmptySlotIndex = -1;
  for (let i = 0; i < len; i++) {
    const slot = slots[i];
    const type = slot.type;
    if (
      (type === ItemType.CTDM && keepCtdm) ||
      (type === ItemType.MATTER_MANIPULATOR && keepMm)
    ) {
      // Retain this core item
    } else {
      // Clear anything else
      slot.type = null;
      if (nextEmptySlotIndex === -1) {
        nextEmptySlotIndex = i;
      }
    }
  }

  if (keepCtdm && !hasCtdmInSlot && nextEmptySlotIndex !== -1) {
    slots[nextEmptySlotIndex].type = ItemType.CTDM;
    while (
      nextEmptySlotIndex < len &&
      slots[nextEmptySlotIndex].type !== null
    ) {
      nextEmptySlotIndex++;
    }
  }
  if (
    keepMm &&
    !hasMatterManipulatorInSlot &&
    nextEmptySlotIndex !== -1 &&
    nextEmptySlotIndex < len
  ) {
    slots[nextEmptySlotIndex].type = ItemType.MATTER_MANIPULATOR;
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
