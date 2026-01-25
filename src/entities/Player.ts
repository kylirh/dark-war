import { EntityKind, WeaponType } from "../types";
import { ContinuousEntity } from "./ContinuousEntity";

/**
 * Player entity with continuous world coordinates
 */
export class PlayerEntity extends ContinuousEntity {
  public readonly kind = EntityKind.PLAYER;

  public hpMax: number;
  public hp: number;
  public sight: number;
  public weapon: WeaponType;
  public ammo: number;
  public ammoReserve: number;
  public keys: number;
  public score: number;
  public grenades: number;
  public landMines: number;

  constructor(gridX: number, gridY: number) {
    super(gridX, gridY);

    this.hpMax = 20;
    this.hp = 20;
    this.sight = 9;
    this.weapon = WeaponType.PISTOL;
    this.ammo = 12;
    this.ammoReserve = 24;
    this.keys = 0;
    this.score = 0;
    this.grenades = 2;
    this.landMines = 1;
    this.nextActTick = 0;
  }
}

/**
 * Create a new player entity (factory function for backward compatibility)
 */
export function createPlayer(x: number, y: number): PlayerEntity {
  return new PlayerEntity(x, y);
}
