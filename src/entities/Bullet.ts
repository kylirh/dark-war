/**
 * Bullet entity for projectile-based combat
 */

import { EntityKind } from "../types";
import { ContinuousEntity } from "./ContinuousEntity";

let nextBulletId = 4000; // Start bullet IDs at 4000

/**
 * Bullet entity with continuous world coordinates
 */
export class BulletEntity extends ContinuousEntity {
  public readonly kind = EntityKind.BULLET;

  public damage: number;
  public ownerId: number;
  public maxDistance: number;
  public traveledDistance: number = 0;

  constructor(
    worldX: number,
    worldY: number,
    velocityX: number,
    velocityY: number,
    damage: number,
    ownerId: number,
    maxDistance: number = 640, // 20 tiles * 32 pixels
  ) {
    // Bullets don't use grid initialization, set world position directly
    super(nextBulletId++, 0, 0);

    this.worldX = worldX;
    this.worldY = worldY;
    this.prevWorldX = worldX;
    this.prevWorldY = worldY;

    this.velocityX = velocityX;
    this.velocityY = velocityY;

    this.damage = damage;
    this.ownerId = ownerId;
    this.maxDistance = maxDistance;

    // Set facing angle based on velocity
    this.facingAngle = Math.atan2(velocityY, velocityX);
  }
}

/**
 * Create a bullet entity (factory function)
 */
export function createBullet(
  worldX: number,
  worldY: number,
  velocityX: number,
  velocityY: number,
  damage: number,
  ownerId: number,
  maxDistance?: number,
): BulletEntity {
  return new BulletEntity(
    worldX,
    worldY,
    velocityX,
    velocityY,
    damage,
    ownerId,
    maxDistance,
  );
}
