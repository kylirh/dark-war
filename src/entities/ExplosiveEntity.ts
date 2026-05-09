import { EntityKind, ItemType } from "../types";
import { GameEntity } from "./GameEntity";

/**
 * Represents grenades and land mines
 */
export class ExplosiveEntity extends GameEntity {
  /** Entity type identifier */
  public readonly kind = EntityKind.EXPLOSIVE;

  /** Whether the explosive is armed and ready to detonate */
  public armed: boolean;

  /** Number of ticks until detonation (for timed explosives) */
  public fuseTicks?: number;

  /** Type of explosive (grenade or land mine) */
  public type: ItemType.GRENADE | ItemType.LAND_MINE;

  /** Entity id that spawned the explosive (used to ignore immediate collisions) */
  public ownerId?: string;

  /** Number of ticks to ignore collisions with the owner */
  public ignoreOwnerTicks?: number;

  /** World position where a thrown grenade should settle */
  public targetWorldX?: number;
  public targetWorldY?: number;

  /** Tile center where the grenade landed */
  public landingWorldX?: number;
  public landingWorldY?: number;

  /** Whether a thrown grenade has reached its intended landing tile */
  public hasLanded: boolean = false;

  /** Ticks until the next small post-landing bounce */
  public landingBounceCooldownTicks: number = 0;

  /** Number of wall ricochets used while in flight */
  public ricochetCount: number = 0;

  constructor(
    worldX: number,
    worldY: number,
    type: ItemType.GRENADE | ItemType.LAND_MINE,
    armed: boolean,
    fuseTicks?: number,
    ownerId?: string,
    ignoreOwnerTicks?: number,
  ) {
    super(0, 0);
    this.worldX = worldX;
    this.worldY = worldY;
    this.prevWorldX = worldX;
    this.prevWorldY = worldY;
    this.type = type;
    this.armed = armed;
    this.fuseTicks = fuseTicks;
    this.ownerId = ownerId;
    this.ignoreOwnerTicks = ignoreOwnerTicks;
  }
}
