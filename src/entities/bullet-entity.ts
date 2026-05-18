import { EntityKind } from "../types";
import { GameEntity } from "./game-entity";

/**
 * Represents a bullet
 */
export class BulletEntity extends GameEntity {
  /** Entity type identifier */
  public readonly kind = EntityKind.BULLET;

  /** Damage dealt on impact */
  public damage: number;

  /** Maximum distance bullet can travel in pixels */
  public maxDistance: number;

  /** ID of entity that fired this bullet */
  public ownerId: string;

  /** Distance traveled so far in pixels */
  public traveledDistance: number = 0;

  /** Seconds until the bullet disappears */
  public fuseSeconds: number;

  /** Number of wall ricochets already used */
  public ricochetCount: number = 0;

  /** Maximum number of ricochets before the bullet is destroyed on wall hit */
  public maxRicochets: number;

  /** Seconds before the bullet can hit its owner after being fired */
  public ownerGraceSeconds: number;

  constructor(
    worldX: number,
    worldY: number,
    velocityX: number,
    velocityY: number,
    damage: number,
    ownerId: string,
    maxDistance: number = 640, // 20 tiles * 32 pixels
    fuseSeconds: number = 2,
    maxRicochets: number = 1,
    ownerGraceSeconds: number = 0.08,
  ) {
    // Bullets don't use grid initialization, set world position directly
    super(0, 0);

    this.worldX = worldX;
    this.worldY = worldY;
    this.prevWorldX = worldX;
    this.prevWorldY = worldY;

    this.velocityX = velocityX;
    this.velocityY = velocityY;

    this.damage = damage;
    this.ownerId = ownerId;
    this.maxDistance = maxDistance;
    this.fuseSeconds = fuseSeconds;
    this.maxRicochets = maxRicochets;
    this.ownerGraceSeconds = ownerGraceSeconds;

    // Set facing angle based on velocity
    this.facingAngle = Math.atan2(velocityY, velocityX);
  }
}
