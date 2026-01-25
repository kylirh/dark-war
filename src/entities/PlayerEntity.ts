import { EntityKind, WeaponType } from "../types";
import { GameEntity } from "./GameEntity";

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

  /** Player score (accumulated through gameplay) */
  public score: number;

  /** Vision range in tiles */
  public sight: number;

  /** Currently equipped weapon type */
  public weapon: WeaponType;

  constructor(gridX: number, gridY: number) {
    super(gridX, gridY);

    this.ammo = 12;
    this.ammoReserve = 24;
    this.grenades = 2;
    this.hp = 20;
    this.hpMax = 20;
    this.keys = 0;
    this.landMines = 1;
    this.nextActTick = 0;
    this.score = 0;
    this.sight = 9;
    this.weapon = WeaponType.PISTOL;
  }
}
