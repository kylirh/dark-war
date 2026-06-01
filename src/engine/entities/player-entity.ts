import {
  EntityKind,
  INVENTORY_TOTAL_SLOTS,
  InventorySlot,
  ItemType,
  WeaponType,
} from "../types";
import { GameEntity } from "./game-entity";
import { RNG } from "../utils/rng";

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

  /** Counts for miscellaneous stackable items (coins, bones, rocks, ...). */
  public itemCounts: Partial<Record<ItemType, number>>;

  /** Flat damage reduction from armor. */
  public armor: number;

  /** Laser weapon charge (drains per shot, refilled by power cells). */
  public laserCharge: number;
  public laserChargeMax: number;

  /** Panic-button charge (consumed on warp, refilled by power cells). */
  public panicCharge: number;
  public panicChargeMax: number;

  /** While `sim.nowTick < slowUntilTick`, the player moves at reduced speed. */
  public slowUntilTick?: number;

  constructor(gridX: number, gridY: number) {
    super(gridX, gridY);

    this.ammo = 0;
    this.ammoReserve = 0;
    this.grenades = 0; // no grenades/mines at the start
    this.hp = 20;
    this.hpMax = 20;
    this.keys = 0;
    this.landMines = 0;
    this.hasCTDM = false;
    this.ctdmEnabled = false;
    this.ctdmCharge = 0;
    this.ctdmChargeMax = 100;
    this.nextActTick = 0;
    this.score = 0;
    this.sight = 9;
    this.weapon = WeaponType.PISTOL;

    this.itemCounts = {};
    this.armor = 0;
    this.laserCharge = 0;
    this.laserChargeMax = 100;
    this.panicCharge = 0;
    this.panicChargeMax = 100;

    this.inventorySlots = Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => ({
      type: null,
    }));
    this.selectedBarSlot = 0;

    this.applyStarterLoadout();
  }

  /**
   * Starter kit: a butcher knife and a black pill always, plus exactly one
   * primary firearm — either a Gyrojet pistol with ammo, or a half-charged
   * laser pistol with no ammo (50/50). No grenades or land mines.
   */
  private applyStarterLoadout(): void {
    const startWithLaser = RNG.chance(0.5);

    if (startWithLaser) {
      this.weapon = WeaponType.LASER;
      this.ammo = 0;
      this.ammoReserve = 0;
      this.laserCharge = Math.floor(this.laserChargeMax * 0.5);
      this.inventorySlots[0] = { type: ItemType.LASER_PISTOL };
      this.inventorySlots[1] = { type: ItemType.BUTCHER_KNIFE };
      this.inventorySlots[2] = { type: ItemType.BLACK_PILL };
    } else {
      this.weapon = WeaponType.PISTOL;
      this.ammo = 12;
      this.ammoReserve = 24;
      this.laserCharge = 0;
      this.inventorySlots[0] = { type: ItemType.PISTOL };
      this.inventorySlots[1] = { type: ItemType.AMMO };
      this.inventorySlots[2] = { type: ItemType.BUTCHER_KNIFE };
      this.inventorySlots[3] = { type: ItemType.BLACK_PILL };
    }

    this.selectedBarSlot = 0;
  }
}
