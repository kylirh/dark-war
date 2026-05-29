import {
  EntityKind,
  INVENTORY_TOTAL_SLOTS,
  InventorySlot,
  ItemType,
  WeaponType,
} from "../types";
import { GameEntity } from "./game-entity";

/**
 * Represents the player
 */
export class PlayerEntity extends GameEntity {
  /** Entity type identifier */
  public readonly kind = EntityKind.PLAYER;

  /** Current ammunition in equipped weapon */
  public ammo: number;

  /** Ammunition in reserve (not in weapon) */
  public ammoReserve: number;

  /** Number of grenades carried */
  public grenades: number;

  /** Current health points */
  public hp: number;

  /** Maximum health points */
  public hpMax: number;

  /** Number of keycards held */
  public keys: number;

  /** Number of land mines carried */
  public landMines: number;

  /** Whether the player has found and installed the CTDM device */
  public hasCTDM: boolean;

  /** Whether CTDM is currently active (can be toggled by player) */
  public ctdmEnabled: boolean;

  /** Current CTDM charge (0–ctdmChargeMax) */
  public ctdmCharge: number;

  /** Maximum CTDM charge */
  public ctdmChargeMax: number;

  /** Player score (accumulated through gameplay) */
  public score: number;

  /** Vision range in tiles */
  public sight: number;

  /** Currently equipped weapon type */
  public weapon: WeaponType;

  /** Inventory slots (36 total: 0–11 = hot bar, 12–35 = extended) */
  public inventorySlots: InventorySlot[];

  /** Index (0–11) of the selected hot-bar slot */
  public selectedBarSlot: number;

  constructor(gridX: number, gridY: number) {
    super(gridX, gridY);

    this.ammo = 12;
    this.ammoReserve = 24;
    this.grenades = 2;
    this.hp = 20;
    this.hpMax = 20;
    this.keys = 0;
    this.landMines = 1;
    this.hasCTDM = false;
    this.ctdmEnabled = false;
    this.ctdmCharge = 0;
    this.ctdmChargeMax = 100;
    this.nextActTick = 0;
    this.score = 0;
    this.sight = 9;
    this.weapon = WeaponType.PISTOL;

    this.inventorySlots = Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => ({
      type: null,
    }));
    this.selectedBarSlot = 0;

    // Place starting items into the hot bar
    this.inventorySlots[0] = { type: ItemType.PISTOL };
    this.inventorySlots[1] = { type: ItemType.AMMO };
    this.inventorySlots[2] = { type: ItemType.GRENADE };
    this.inventorySlots[3] = { type: ItemType.LAND_MINE };
  }
}
