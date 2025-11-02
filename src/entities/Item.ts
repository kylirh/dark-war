import { Item, EntityKind, ItemType } from "../types";
import { RNG } from "../utils/RNG";

/**
 * Item metadata definitions
 */
const ITEM_META = {
  [ItemType.PISTOL]: {
    ch: ")",
    color: "#b8d1ff",
    name: "Pistol",
  },
  [ItemType.AMMO]: {
    ch: "‧",
    color: "#7bd88f",
    name: "Ammo",
  },
  [ItemType.MEDKIT]: {
    ch: "!",
    color: "#ffd166",
    name: "Medkit",
  },
  [ItemType.KEYCARD]: {
    ch: "¤",
    color: "#eab3ff",
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
    kind: EntityKind.ITEM,
    x,
    y,
    type,
    ch: meta.ch,
    color: meta.color,
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
