import {
  INVENTORY_BAR_SIZE,
  INVENTORY_TOTAL_SLOTS,
  InventorySlot,
  ItemType,
  Player,
  STACKABLE_ITEMS,
  WeaponType,
} from "../types";

export function isInventoryFull(player: Player): boolean {
  return player.inventorySlots.every((s) => s.type !== null);
}

export function canAddToInventory(player: Player, itemType: ItemType): boolean {
  if (STACKABLE_ITEMS.includes(itemType)) {
    return player.inventorySlots.some(
      (s) => s.type === itemType || s.type === null,
    );
  }
  // Non-stackable: need empty slot and not already owned
  const alreadyHave = player.inventorySlots.some((s) => s.type === itemType);
  if (alreadyHave) return false;
  return player.inventorySlots.some((s) => s.type === null);
}

export function addToInventory(player: Player, itemType: ItemType): boolean {
  if (STACKABLE_ITEMS.includes(itemType)) {
    // Stack into existing slot first
    const existing = player.inventorySlots.find((s) => s.type === itemType);
    if (existing) return true; // slot already present, count tracked by flat prop

    // Place in first empty slot
    const empty = player.inventorySlots.find((s) => s.type === null);
    if (!empty) return false;
    empty.type = itemType;
    return true;
  }

  // Non-stackable
  const alreadyHave = player.inventorySlots.some((s) => s.type === itemType);
  if (alreadyHave) {
    // Already have it — special handling per type done in events.ts
    return true;
  }
  const empty = player.inventorySlots.find((s) => s.type === null);
  if (!empty) return false;
  empty.type = itemType;
  return true;
}

export function removeFromInventory(player: Player, itemType: ItemType): void {
  const slot = player.inventorySlots.find((s) => s.type === itemType);
  if (slot) slot.type = null;
}

export function getSlotDisplayCount(
  player: Player,
  slotIndex: number,
): number | null {
  const slot = player.inventorySlots[slotIndex];
  if (!slot?.type) return null;
  switch (slot.type) {
    case ItemType.PISTOL:
      return player.ammo;
    case ItemType.AMMO:
      return player.ammoReserve;
    case ItemType.GRENADE:
      return player.grenades;
    case ItemType.LAND_MINE:
      return player.landMines;
    case ItemType.KEYCARD:
      return player.keys;
    case ItemType.CTDM:
      return null; // shown as bar instead
    case ItemType.POWERCELL:
      return null;
    default:
      return null;
  }
}

export function getWeaponForSlot(slot: InventorySlot | null): WeaponType {
  if (!slot?.type) return WeaponType.MELEE;
  switch (slot.type) {
    case ItemType.PISTOL:
      return WeaponType.PISTOL;
    case ItemType.GRENADE:
      return WeaponType.GRENADE;
    case ItemType.LAND_MINE:
      return WeaponType.LAND_MINE;
    default:
      return WeaponType.MELEE;
  }
}

export function getSlotLabel(itemType: ItemType | null): string {
  if (!itemType) return "";
  switch (itemType) {
    case ItemType.PISTOL:
      return "Pistol";
    case ItemType.AMMO:
      return "Ammo";
    case ItemType.MEDKIT:
      return "Medkit";
    case ItemType.KEYCARD:
      return "Keycard";
    case ItemType.GRENADE:
      return "Grenade";
    case ItemType.LAND_MINE:
      return "Land Mine";
    case ItemType.CTDM:
      return "CTDM Module";
    case ItemType.POWERCELL:
      return "Powercell";
    default:
      return itemType;
  }
}

export function getSlotActions(itemType: ItemType | null): string[] {
  if (!itemType) return [];
  switch (itemType) {
    case ItemType.PISTOL:
      return ["Select (click)", "Reload (R)"];
    case ItemType.AMMO:
      return ["Used for reload (R)"];
    case ItemType.MEDKIT:
      return ["Use to heal (double-click)"];
    case ItemType.KEYCARD:
      return ["Opens locked doors (O)"];
    case ItemType.GRENADE:
      return ["Select (click)", "Throw (left-click)"];
    case ItemType.LAND_MINE:
      return ["Select (click)", "Place (left-click)"];
    case ItemType.CTDM:
      return ["Toggle time dilation (C)"];
    case ItemType.POWERCELL:
      return ["Recharges CTDM"];
    default:
      return [];
  }
}

/** Returns 0–11 hot-bar key label for a slot index */
export function getSlotKeyLabel(slotIndex: number): string {
  const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  return labels[slotIndex] ?? "";
}

export function swapInventorySlots(player: Player, a: number, b: number): void {
  if (a < 0 || a >= INVENTORY_TOTAL_SLOTS) return;
  if (b < 0 || b >= INVENTORY_TOTAL_SLOTS) return;
  const tmp = player.inventorySlots[a];
  player.inventorySlots[a] = player.inventorySlots[b];
  player.inventorySlots[b] = tmp;
}

export function moveInventorySlot(
  player: Player,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex < 0 || fromIndex >= INVENTORY_TOTAL_SLOTS) return;
  if (toIndex < 0 || toIndex >= INVENTORY_TOTAL_SLOTS) return;
  const fromSlot = player.inventorySlots[fromIndex];
  const toSlot = player.inventorySlots[toIndex];

  if (fromSlot.type === null) return;

  if (toSlot.type === null) {
    toSlot.type = fromSlot.type;
    fromSlot.type = null;
  } else {
    // Swap
    const tmp = fromSlot.type;
    fromSlot.type = toSlot.type;
    toSlot.type = tmp;
  }

  // If the selected bar slot was involved, keep weapon in sync
  if (fromIndex < INVENTORY_BAR_SIZE || toIndex < INVENTORY_BAR_SIZE) {
    // Caller is responsible for updating player.weapon after this
  }
}
