import { EntityKind, ItemType } from "../types";
import { GameEntity } from "./game-entity";
import { RNG } from "../utils/rng";
import { itemName } from "../content/item-defs";

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
    this.name = itemName(type);

    // Add type-specific properties
    if (type === ItemType.AMMO) {
      this.amount = amount ?? 8 + RNG.int(10);
    } else if (type === ItemType.MEDKIT) {
      this.heal = 6 + RNG.int(8);
    } else if (type === ItemType.POWERCELL) {
      this.amount = amount ?? 20 + RNG.int(21);
    } else if (type === ItemType.COIN) {
      this.amount = amount ?? 1 + RNG.int(5);
    } else if (type === ItemType.ROCK) {
      this.amount = amount ?? 1;
    }

    // Items are static. This ensures zero velocity.
    this.velocityX = 0;
    this.velocityY = 0;
  }
}
