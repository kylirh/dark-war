import { EntityKind, ItemType } from "../types";
import { GameEntity } from "./GameEntity";
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
 * Represents an item that can be picked up and used
 */
export class ItemEntity extends GameEntity {
  /** Entity type identifier */
  public readonly kind = EntityKind.ITEM;

  /** Amount of resource (e.g., ammo quantity) */
  public amount?: number;

  /** Health restored by this item (for medkits) */
  public heal?: number;

  /** Display name of the item */
  public name: string;

  /** Item type (pistol, ammo, medkit, etc.) */
  public type: ItemType;

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

    // Items are static. This ensures zero velocity.
    this.velocityX = 0;
    this.velocityY = 0;
  }
}
