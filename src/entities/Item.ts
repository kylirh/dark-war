import { EntityKind, ItemType } from "../types";
import { GameObject } from "./GameObject";
import { RNG } from "../utils/RNG";

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
  [ItemType.GRENADE]: {
    name: "Grenade",
  },
  [ItemType.LAND_MINE]: {
    name: "Land Mine",
  },
};

/**
 * Item entity with continuous world coordinates
 */
export class ItemEntity extends GameObject {
  public readonly kind = EntityKind.ITEM;

  public type: ItemType;
  public name: string;
  public amount?: number;
  public heal?: number;

  constructor(gridX: number, gridY: number, type: ItemType, amount?: number) {
    super(gridX, gridY);

    this.type = type;
    this.name = ITEM_META[type].name;

    // Add type-specific properties
    if (type === ItemType.AMMO) {
      this.amount = amount || 8 + RNG.int(10);
    } else if (type === ItemType.MEDKIT) {
      this.heal = 6 + RNG.int(8);
    }

    // Items are static - ensure zero velocity
    this.velocityX = 0;
    this.velocityY = 0;
  }
}

/**
 * Create an item entity (factory function for backward compatibility)
 */
export function createItem(
  x: number,
  y: number,
  type: ItemType,
  amount = 0,
): ItemEntity {
  return new ItemEntity(x, y, type, amount);
}
