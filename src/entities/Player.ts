import { EntityKind, WeaponType } from "../types";
import { GameObject } from "./GameObject";

/**
 * Player entity with continuous world coordinates
 */
export class PlayerEntity extends GameObject {
  public ammo: number;
  public ammoReserve: number;
  public grenades: number;
  public hp: number;
  public readonly kind = EntityKind.PLAYER;
  public hpMax: number;
  public keys: number;
  public landMines: number;
  public score: number;
  public sight: number;
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

/**
 * Create a new player entity (factory function for backward compatibility)
 */
export function createPlayer(gridX: number, gridY: number): PlayerEntity {
  return new PlayerEntity(gridX, gridY);
}
