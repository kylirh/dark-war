import { Item, EntityKind, ItemType } from "../types";
import { RNG } from "../utils/RNG";

let nextItemId = 3000; // Start item IDs at 3000

/**
 * Item metadata definitions
 */
const ITEM_META = {
  [ItemType.PISTOL]: {
    name: "Pistol",
  },
  [ItemType.AMMO]: {
    name: "Ammo",
  },
  [ItemType.MEDKIT]: {
    name: "Medkit",
  },
  [ItemType.KEYCARD]: {
    name: "Keycard",
  },
};

/**
 * Create an item entity
 */
export function createItem(
  x: number,
  y: number,
  type: ItemType,
  amount = 0
): Item {
  const meta = ITEM_META[type];
  const item: Item = {
    id: nextItemId++,
    kind: EntityKind.ITEM,
    x,
    y,
    type,
    name: meta.name,
  };

  // Add type-specific properties
  if (type === ItemType.AMMO) {
    item.amount = amount || 8 + RNG.int(10);
  } else if (type === ItemType.MEDKIT) {
    item.heal = 6 + RNG.int(8);
  }

  return item;
}
