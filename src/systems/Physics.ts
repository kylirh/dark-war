/**
 * Physics System - Continuous movement and collision detection
 *
 * Manages:
 * - Smooth entity movement at 200px/s
 * - Wall collision with sliding (only cancel perpendicular velocity)
 * - Bullet collision detection and damage
 * - Line of sight raycasting
 *
 * Uses detect-collisions library:
 * - Circle colliders for entities (8px player, 7px monster, 4px bullet)
 * - Box colliders for walls (16px half-extent = 32px full tile)
 * - Wall sliding allows smooth corridor navigation
 */

import { System, Circle, Box, Response } from "detect-collisions";
import {
  GameState,
  EntityKind,
  TileType,
  ItemType,
  EventType,
  CELL_CONFIG,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../types";
import { GameEntity } from "../entities/GameEntity";
import { PlayerEntity } from "../entities/PlayerEntity";
import { MonsterEntity } from "../entities/MonsterEntity";
import { ItemEntity } from "../entities/ItemEntity";
import { BulletEntity } from "../entities/BulletEntity";
import { ExplosiveEntity } from "../entities/ExplosiveEntity";
import { idx, tileAt } from "../utils/helpers";
import { applyWallDamageAtIndex } from "../utils/walls";

import { pushEvent } from "./Simulation";

// Collision radii - sized to allow smooth corridor navigation
// With 32px tiles, an 8px radius (16px diameter) leaves 16px clearance in corridors
const PLAYER_RADIUS = 8;
const MONSTER_RADIUS = 7;
const ITEM_RADIUS = 6;
const BULLET_RADIUS = 4;
const EXPLOSIVE_RADIUS = 6;
const COLLISION_RESOLUTION_ITERATIONS = 3;
const VELOCITY_EPSILON = 0.01;
const BULLET_RICOCHET_DOT_THRESHOLD = 0.38;
const BULLET_RICOCHET_SPEED_RETAINED = 0.72;
const GRENADE_RICOCHET_SPEED_RETAINED = 0.58;
const LANDED_GRENADE_DAMPING = 0.82;

/**
 * Physics system manager
 */
export class Physics {
  private system: System;
  private wallBodies: Map<number, Box> = new Map(); // tileIndex -> Box

  constructor() {
    this.system = new System();
  }

  /**
   * Initialize physics bodies for the current map
   */
  public initializeMap(map: TileType[]): void {
    // Clear existing wall bodies
    for (const body of this.wallBodies.values()) {
      this.system.remove(body);
    }
    this.wallBodies.clear();

    // Create box colliders for walls and closed doors
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileIndex = idx(x, y);
        const tile = map[tileIndex];

        if (
          tile === TileType.WALL ||
          tile === TileType.DOOR_CLOSED ||
          tile === TileType.DOOR_LOCKED
        ) {
          // Position box at tile corner (not center) for proper alignment
          const worldX = x * CELL_CONFIG.w;
          const worldY = y * CELL_CONFIG.h;

          // createBox parameters: position, width, height
          // Position is top-left corner, dimensions are full size
          const box = this.system.createBox(
            { x: worldX, y: worldY },
            CELL_CONFIG.w, // 32px full width
            CELL_CONFIG.h, // 32px full height
          );
          box.isStatic = true;
          (box as any).isWall = true;
          (box as any).tileIndex = tileIndex;

          this.wallBodies.set(tileIndex, box);
        }
      }
    }
  }

  /**
   * Update physics body for a single tile (e.g., when door opens/closes)
   */
  public updateTile(x: number, y: number, tile: TileType): void {
    const tileIndex = idx(x, y);

    // Remove existing wall body if present
    const existingBody = this.wallBodies.get(tileIndex);
    if (existingBody) {
      this.system.remove(existingBody);
      this.wallBodies.delete(tileIndex);
    }

    // Create new wall body if tile should block
    if (
      tile === TileType.WALL ||
      tile === TileType.DOOR_CLOSED ||
      tile === TileType.DOOR_LOCKED
    ) {
      const worldX = x * CELL_CONFIG.w;
      const worldY = y * CELL_CONFIG.h;

      const box = this.system.createBox(
        { x: worldX, y: worldY },
        CELL_CONFIG.w,
        CELL_CONFIG.h,
      );
      box.isStatic = true;
      (box as any).isWall = true;
      (box as any).tileIndex = tileIndex;

      this.wallBodies.set(tileIndex, box);
    }
  }

  /**
   * Add or update entity physics body
   */
  public updateEntityBody(entity: GameEntity): void {
    // Remove existing body if present
    if (entity.physicsBody) {
      this.system.remove(entity.physicsBody);
    }

    // Create appropriate collider based on entity type
    let radius: number;
    if (entity.kind === EntityKind.PLAYER) {
      radius = PLAYER_RADIUS;
    } else if (entity.kind === EntityKind.MONSTER) {
      radius = MONSTER_RADIUS;
    } else if (entity.kind === EntityKind.ITEM) {
      radius = ITEM_RADIUS;
    } else if (entity.kind === EntityKind.BULLET) {
      radius = BULLET_RADIUS;
    } else if (entity.kind === EntityKind.EXPLOSIVE) {
      radius = EXPLOSIVE_RADIUS;
    } else {
      radius = 8; // Default
    }

    const circle = this.system.createCircle(
      { x: entity.worldX, y: entity.worldY },
      radius,
    );

    // Items don't block movement
    if (entity.kind === EntityKind.ITEM) {
      circle.isTrigger = true;
    }

    // Bullets are triggers (don't physically block)
    if (entity.kind === EntityKind.BULLET) {
      circle.isTrigger = true;
    }

    if (entity.kind === EntityKind.EXPLOSIVE) {
      circle.isTrigger = true;
    }

    // Store reference
    (circle as any).entityId = entity.id;
    entity.physicsBody = circle;
  }

  /**
   * Remove entity from physics system
   */
  public removeEntity(entity: GameEntity): void {
    if (entity.physicsBody) {
      this.system.remove(entity.physicsBody);
      entity.physicsBody = undefined;
    }
  }

  /**
   * Update physics for all entities
   * @param state Game state
   * @param dt Delta time in seconds (already scaled by timeScale * REAL_TIME_SPEED)
   */
  public updatePhysics(state: GameState, dt: number): void {
    const entityIds = new Set(state.entities.map((entity) => entity.id));
    for (const body of this.system.all()) {
      const entityId = (body as any).entityId;
      if (entityId !== undefined && !entityIds.has(entityId)) {
        this.system.remove(body);
      }
    }

    // Ensure all entities have physics bodies
    for (const entity of state.entities) {
      if (entity instanceof GameEntity && !entity.physicsBody) {
        this.updateEntityBody(entity);
      }
    }

    // Process each entity
    for (const entity of state.entities) {
      if (!(entity instanceof GameEntity)) continue;

      // Items are static - never move them
      if (entity.kind === EntityKind.ITEM) {
        continue;
      }

      // Skip if entity has no velocity
      if (entity.velocityX === 0 && entity.velocityY === 0) {
        continue;
      }

      // Store previous position for movement/animation logic
      entity.prevWorldX = entity.worldX;
      entity.prevWorldY = entity.worldY;

      // Apply velocity directly (continuous movement, no targets)
      entity.worldX += entity.velocityX * dt;
      entity.worldY += entity.velocityY * dt;

      // Clamp to world bounds to prevent entities escaping the map
      const entityRadius = entity.kind === EntityKind.PLAYER ? PLAYER_RADIUS
        : entity.kind === EntityKind.MONSTER ? MONSTER_RADIUS
        : entity.kind === EntityKind.BULLET ? BULLET_RADIUS
        : entity.kind === EntityKind.EXPLOSIVE ? EXPLOSIVE_RADIUS
        : 8;
      const minBound = CELL_CONFIG.w + entityRadius;
      const maxBoundX = (MAP_WIDTH - 1) * CELL_CONFIG.w - entityRadius;
      const maxBoundY = (MAP_HEIGHT - 1) * CELL_CONFIG.h - entityRadius;

      if (entity.worldX < minBound) {
        entity.worldX = minBound;
        entity.velocityX = 0;
      } else if (entity.worldX > maxBoundX) {
        entity.worldX = maxBoundX;
        entity.velocityX = 0;
      }
      if (entity.worldY < minBound) {
        entity.worldY = minBound;
        entity.velocityY = 0;
      } else if (entity.worldY > maxBoundY) {
        entity.worldY = maxBoundY;
        entity.velocityY = 0;
      }

      // Update physics body position
      if (entity.physicsBody) {
        entity.physicsBody.setPosition(entity.worldX, entity.worldY);
      }
    }

    // Update spatial hash after moving all entities
    this.system.update();

    // Check and resolve collisions. A few passes keep actor crowds from
    // remaining partially interpenetrated after a single-frame shove.
    for (let i = 0; i < COLLISION_RESOLUTION_ITERATIONS; i++) {
      this.system.checkAll((response) => {
        this.handleCollision(state, response);
      });
      this.system.update();
    }
  }

  /**
   * Handle collision between two bodies
   *
   * In detect-collisions, response.overlapV is the vector from A to B.
   * To separate: A moves in NEGATIVE overlapV direction, B moves in POSITIVE direction.
   *
   * Wall sliding: Only cancel velocity component moving INTO the wall, preserve parallel movement.
   */
  private handleCollision(state: GameState, response: Response): void {
    const bodyA = response.a;
    const bodyB = response.b;

    // Get entity references
    const entityA = this.getEntityFromBody(state, bodyA);
    const entityB = this.getEntityFromBody(state, bodyB);

    // Wall collision - push entity out of wall with wall sliding
    if (
      (bodyA as any).isWall &&
      entityB &&
      this.usesActorWallResolution(entityB)
    ) {
      // Push entity out with small safety margin to prevent tunneling
      const separation = 1.01; // 1% extra separation
      entityB.worldX += response.overlapV.x * separation;
      entityB.worldY += response.overlapV.y * separation;

      // Wall sliding: Only cancel velocity component pushing INTO the wall
      const absOverlapX = Math.abs(response.overlapV.x);
      const absOverlapY = Math.abs(response.overlapV.y);

      if (absOverlapX > absOverlapY) {
        // Horizontal wall - only cancel X velocity if moving into wall
        if (
          (response.overlapV.x > 0 && entityB.velocityX < 0) ||
          (response.overlapV.x < 0 && entityB.velocityX > 0)
        ) {
          entityB.velocityX = 0;
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall - only cancel Y velocity if moving into wall
        if (
          (response.overlapV.y > 0 && entityB.velocityY < 0) ||
          (response.overlapV.y < 0 && entityB.velocityY > 0)
        ) {
          entityB.velocityY = 0;
        }
      } else {
        // Corner hit - cancel all velocity
        entityB.velocityX = 0;
        entityB.velocityY = 0;
      }

      if (entityB.physicsBody) {
        entityB.physicsBody.setPosition(entityB.worldX, entityB.worldY);
      }
    } else if (
      (bodyB as any).isWall &&
      entityA &&
      this.usesActorWallResolution(entityA)
    ) {
      // Push entity out with small safety margin to prevent tunneling
      const separation = 1.01; // 1% extra separation
      entityA.worldX -= response.overlapV.x * separation;
      entityA.worldY -= response.overlapV.y * separation;

      // Wall sliding: Only cancel velocity component pushing INTO the wall
      const absOverlapX = Math.abs(response.overlapV.x);
      const absOverlapY = Math.abs(response.overlapV.y);

      if (absOverlapX > absOverlapY) {
        // Horizontal wall - only cancel X velocity if moving into wall
        if (
          (response.overlapV.x > 0 && entityA.velocityX > 0) ||
          (response.overlapV.x < 0 && entityA.velocityX < 0)
        ) {
          entityA.velocityX = 0;
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall - only cancel Y velocity if moving into wall
        if (
          (response.overlapV.y > 0 && entityA.velocityY > 0) ||
          (response.overlapV.y < 0 && entityA.velocityY < 0)
        ) {
          entityA.velocityY = 0;
        }
      } else {
        // Corner hit - cancel all velocity
        entityA.velocityX = 0;
        entityA.velocityY = 0;
      }

      if (entityA.physicsBody) {
        entityA.physicsBody.setPosition(entityA.worldX, entityA.worldY);
      }
    } else if (
      entityA &&
      entityB &&
      this.isSolidActor(entityA) &&
      this.isSolidActor(entityB)
    ) {
      this.resolveActorCollision(entityA, entityB, response);
    }
  }

  /**
   * Resolve physical body blocking between players and monsters.
   */
  private resolveActorCollision(
    entityA: GameEntity,
    entityB: GameEntity,
    response: Response,
  ): void {
    const aIsMoving = this.isMoving(entityA);
    const bIsMoving = this.isMoving(entityB);

    let aSeparation = 0.5;
    let bSeparation = 0.5;

    if (aIsMoving && !bIsMoving) {
      aSeparation = 1.01;
      bSeparation = 0;
    } else if (!aIsMoving && bIsMoving) {
      aSeparation = 0;
      bSeparation = 1.01;
    } else if (!aIsMoving && !bIsMoving) {
      aSeparation = 0.505;
      bSeparation = 0.505;
    }

    entityA.worldX -= response.overlapV.x * aSeparation;
    entityA.worldY -= response.overlapV.y * aSeparation;
    entityB.worldX += response.overlapV.x * bSeparation;
    entityB.worldY += response.overlapV.y * bSeparation;

    this.cancelVelocityIntoActor(
      entityA,
      response.overlapV.x,
      response.overlapV.y,
    );
    this.cancelVelocityIntoActor(
      entityB,
      -response.overlapV.x,
      -response.overlapV.y,
    );

    if (entityA.physicsBody) {
      entityA.physicsBody.setPosition(entityA.worldX, entityA.worldY);
    }
    if (entityB.physicsBody) {
      entityB.physicsBody.setPosition(entityB.worldX, entityB.worldY);
    }
  }

  /**
   * Remove only the velocity component pushing an actor into another actor.
   */
  private cancelVelocityIntoActor(
    entity: GameEntity,
    normalX: number,
    normalY: number,
  ): void {
    const length = Math.sqrt(normalX * normalX + normalY * normalY);
    if (length <= VELOCITY_EPSILON) return;

    const unitX = normalX / length;
    const unitY = normalY / length;
    const intoSpeed = entity.velocityX * unitX + entity.velocityY * unitY;
    if (intoSpeed <= 0) return;

    entity.velocityX -= intoSpeed * unitX;
    entity.velocityY -= intoSpeed * unitY;

    if (Math.abs(entity.velocityX) < VELOCITY_EPSILON) {
      entity.velocityX = 0;
    }
    if (Math.abs(entity.velocityY) < VELOCITY_EPSILON) {
      entity.velocityY = 0;
    }
  }

  /**
   * Actors occupy space. Projectiles, items, and explosives remain trigger-like.
   */
  private isSolidActor(entity: GameEntity): boolean {
    if (
      entity.kind !== EntityKind.PLAYER &&
      entity.kind !== EntityKind.MONSTER
    ) {
      return false;
    }

    const hp = (entity as any).hp;
    return typeof hp !== "number" || hp > 0;
  }

  /**
   * Only actors use the general wall solver. Projectiles and explosives handle
   * wall impacts in their own update passes so they can expire or ricochet.
   */
  private usesActorWallResolution(entity: GameEntity): boolean {
    return entity.kind === EntityKind.PLAYER || entity.kind === EntityKind.MONSTER;
  }

  /**
   * Check whether an entity has meaningful velocity.
   */
  private isMoving(entity: GameEntity): boolean {
    return (
      Math.abs(entity.velocityX) > VELOCITY_EPSILON ||
      Math.abs(entity.velocityY) > VELOCITY_EPSILON
    );
  }

  /**
   * Get entity from physics body
   */
  private getEntityFromBody(
    state: GameState,
    body: Circle | Box,
  ): GameEntity | undefined {
    const entityId = (body as any).entityId;
    if (entityId === undefined) return undefined;

    const entity = state.entities.find((e) => e.id === entityId);
    if (
      entity &&
      (entity instanceof GameEntity ||
        entity instanceof PlayerEntity ||
        entity instanceof MonsterEntity ||
        entity instanceof ItemEntity ||
        entity instanceof BulletEntity ||
        entity instanceof ExplosiveEntity)
    ) {
      return entity as GameEntity;
    }
    return undefined;
  }

  /**
   * Update bullets - move, check collisions, apply damage
   */
  public updateBullets(state: GameState, dt: number): void {
    const bullets = state.entities.filter(
      (e): e is BulletEntity =>
        e.kind === EntityKind.BULLET && e instanceof BulletEntity,
    );

    for (const bullet of bullets) {
      bullet.fuseSeconds -= dt;
      if (bullet.ownerGraceSeconds > 0) {
        bullet.ownerGraceSeconds = Math.max(0, bullet.ownerGraceSeconds - dt);
      }

      // Track distance traveled
      const distanceThisFrame =
        Math.sqrt(
          bullet.velocityX * bullet.velocityX +
            bullet.velocityY * bullet.velocityY,
        ) * dt;
      bullet.traveledDistance += distanceThisFrame;

      // Remove if exceeded max distance or timed out
      if (
        bullet.traveledDistance >= bullet.maxDistance ||
        bullet.fuseSeconds <= 0
      ) {
        this.removeStateEntity(state, bullet);
        continue;
      }

      // Check for actual collisions (not just potentials)
      if (bullet.physicsBody) {
        let bulletRemoved = false;

        // Check collision with walls using checkOne
        this.system.checkOne(bullet.physicsBody, (response) => {
          if (bulletRemoved) return;

          const other = response.b;

          // Hit wall
          if ((other as any).isWall) {
            const tileIndex = (other as any).tileIndex;
            const ricocheted = this.tryRicochetBullet(bullet, response);
            if (!ricocheted && typeof tileIndex === "number") {
              applyWallDamageAtIndex(state, tileIndex, bullet.damage);
            }
            if (!ricocheted) {
              // Spawn impact sparks
              const baseAngle = Math.atan2(bullet.velocityY, bullet.velocityX) + Math.PI;
              for (let s = 0; s < 7; s++) {
                const angle = baseAngle + (Math.random() - 0.5) * 1.8;
                const speed = 60 + Math.random() * 120;
                state.effects.push({
                  id: crypto.randomUUID(),
                  type: "spark",
                  worldX: bullet.worldX,
                  worldY: bullet.worldY,
                  ageTicks: 0,
                  durationTicks: 5,
                  velocityX: Math.cos(angle) * speed,
                  velocityY: Math.sin(angle) * speed,
                });
              }
              this.removeStateEntity(state, bullet);
              bulletRemoved = true;
            }
            return;
          }

          // Hit monster
          const targetEntity = this.getEntityFromBody(
            state,
            other as Circle | Box,
          );
          if (
            targetEntity &&
            (targetEntity.kind === EntityKind.MONSTER ||
              targetEntity.kind === EntityKind.PLAYER) &&
            (targetEntity.id !== bullet.ownerId ||
              bullet.ownerGraceSeconds <= 0 ||
              bullet.ricochetCount > 0)
          ) {
            // Apply damage via simulation event pipeline for drops
            pushEvent(state, {
              type: EventType.DAMAGE,
              data: {
                type: "DAMAGE",
                targetId: targetEntity.id,
                amount: bullet.damage,
                sourceId: bullet.ownerId,
                suppressHitSound: true,
                knockbackX: bullet.velocityX,
                knockbackY: bullet.velocityY,
                knockbackDistance: 6,
              },
            });

            // Remove bullet
            this.removeStateEntity(state, bullet);
            bulletRemoved = true;
          }
        });
      }
    }
  }

  /**
   * Reflect a bullet off a wall for shallow impacts.
   */
  private tryRicochetBullet(bullet: BulletEntity, response: Response): boolean {
    if (bullet.ricochetCount >= bullet.maxRicochets) return false;

    const speed = Math.sqrt(
      bullet.velocityX * bullet.velocityX + bullet.velocityY * bullet.velocityY,
    );
    if (speed <= VELOCITY_EPSILON) return false;

    const normal = this.normalFromWallImpact(response);
    if (!normal) return false;

    const unitVelocityX = bullet.velocityX / speed;
    const unitVelocityY = bullet.velocityY / speed;
    const incomingDot = unitVelocityX * normal.x + unitVelocityY * normal.y;
    if (
      incomingDot >= 0 ||
      Math.abs(incomingDot) > BULLET_RICOCHET_DOT_THRESHOLD
    ) {
      return false;
    }

    const reflectedX = unitVelocityX - 2 * incomingDot * normal.x;
    const reflectedY = unitVelocityY - 2 * incomingDot * normal.y;
    const nextSpeed = speed * BULLET_RICOCHET_SPEED_RETAINED;
    bullet.velocityX = reflectedX * nextSpeed;
    bullet.velocityY = reflectedY * nextSpeed;
    bullet.facingAngle = Math.atan2(bullet.velocityY, bullet.velocityX);
    bullet.ricochetCount++;
    bullet.ownerGraceSeconds = 0;

    bullet.worldX += normal.x * (BULLET_RADIUS + 1);
    bullet.worldY += normal.y * (BULLET_RADIUS + 1);
    if (bullet.physicsBody) {
      bullet.physicsBody.setPosition(bullet.worldX, bullet.worldY);
    }

    return true;
  }

  /**
   * Returns a unit normal pointing from the impacted wall toward the projectile.
   */
  private normalFromWallImpact(
    response: Response,
  ): { x: number; y: number } | null {
    const normalX = -response.overlapV.x;
    const normalY = -response.overlapV.y;
    const length = Math.sqrt(normalX * normalX + normalY * normalY);
    if (length <= VELOCITY_EPSILON) return null;
    return { x: normalX / length, y: normalY / length };
  }

  /**
   * Remove an entity from both state and the collision system.
   */
  private removeStateEntity(state: GameState, entity: GameEntity): void {
    this.removeEntity(entity);
    const index = state.entities.indexOf(entity as any);
    if (index > -1) state.entities.splice(index, 1);
  }

  /**
   * Update explosives - move, check collisions with monsters and walls
   */
  public updateExplosives(state: GameState, dt: number): void {
    const explosives = state.entities.filter(
      (e): e is ExplosiveEntity =>
        e.kind === EntityKind.EXPLOSIVE && e instanceof ExplosiveEntity,
    );

    for (const explosive of explosives) {
      if (
        typeof explosive.ignoreOwnerTicks === "number" &&
        explosive.ignoreOwnerTicks > 0
      ) {
        explosive.ignoreOwnerTicks -= 1;
      }
      if (explosive.type === ItemType.GRENADE && explosive.hasLanded) {
        explosive.velocityX *= LANDED_GRENADE_DAMPING;
        explosive.velocityY *= LANDED_GRENADE_DAMPING;
        if (Math.abs(explosive.velocityX) < 4) explosive.velocityX = 0;
        if (Math.abs(explosive.velocityY) < 4) explosive.velocityY = 0;
      }

      const explosiveIsMoving =
        explosive.velocityX !== 0 || explosive.velocityY !== 0;
      if (explosive.type !== ItemType.GRENADE && !explosiveIsMoving) {
        continue;
      }

      // Check for actual collisions
      if (explosive.physicsBody) {
        let shouldExplode = false;

        // Check collision using checkOne
        this.system.checkOne(explosive.physicsBody, (response) => {
          if (shouldExplode) return;

          const other = response.b;

          // Hit wall - ricochet
          if ((other as any).isWall && explosive.type === ItemType.GRENADE) {
            this.ricochetExplosive(explosive, response);
            return;
          }

          const targetEntity = this.getEntityFromBody(
            state,
            other as Circle | Box,
          );
          if (!targetEntity) return;

          if (
            targetEntity.id === explosive.ownerId &&
            (explosive.ignoreOwnerTicks ?? 0) > 0
          ) {
            return;
          }

          if (
            targetEntity.kind === EntityKind.MONSTER ||
            targetEntity.kind === EntityKind.PLAYER
          ) {
            shouldExplode = true;
            return;
          }
        });

        // Trigger immediate explosion on impact
        if (shouldExplode) {
          // Stop the explosive's movement
          explosive.velocityX = 0;
          explosive.velocityY = 0;
          // Set fuse to 0 to trigger explosion on next tick
          explosive.fuseTicks = 0;
        }
      }

      this.updateGrenadeLanding(explosive);
    }
  }

  /**
   * Reflect a grenade off a wall and keep it live until actor contact or fuse.
   */
  private ricochetExplosive(
    explosive: ExplosiveEntity,
    response: Response,
  ): void {
    const speed = Math.sqrt(
      explosive.velocityX * explosive.velocityX +
        explosive.velocityY * explosive.velocityY,
    );
    if (speed <= VELOCITY_EPSILON) return;

    const normal = this.normalFromWallImpact(response);
    if (!normal) return;

    const unitVelocityX = explosive.velocityX / speed;
    const unitVelocityY = explosive.velocityY / speed;
    const incomingDot = unitVelocityX * normal.x + unitVelocityY * normal.y;
    if (incomingDot >= 0) return;

    const reflectedX = unitVelocityX - 2 * incomingDot * normal.x;
    const reflectedY = unitVelocityY - 2 * incomingDot * normal.y;
    const nextSpeed = speed * GRENADE_RICOCHET_SPEED_RETAINED;
    explosive.velocityX = reflectedX * nextSpeed;
    explosive.velocityY = reflectedY * nextSpeed;
    explosive.facingAngle = Math.atan2(
      explosive.velocityY,
      explosive.velocityX,
    );
    explosive.ricochetCount++;

    explosive.worldX += normal.x * (EXPLOSIVE_RADIUS + 1);
    explosive.worldY += normal.y * (EXPLOSIVE_RADIUS + 1);
    if (explosive.physicsBody) {
      explosive.physicsBody.setPosition(explosive.worldX, explosive.worldY);
    }
  }

  /**
   * Snap player-thrown grenades to their clicked tile once their flight reaches it.
   */
  private updateGrenadeLanding(explosive: ExplosiveEntity): void {
    if (
      explosive.type !== ItemType.GRENADE ||
      explosive.targetWorldX === undefined
    ) {
      return;
    }
    if (
      explosive.hasLanded ||
      typeof explosive.targetWorldX !== "number" ||
      typeof explosive.targetWorldY !== "number"
    ) {
      return;
    }

    const prevDx = explosive.targetWorldX - explosive.prevWorldX;
    const prevDy = explosive.targetWorldY - explosive.prevWorldY;
    const currentDx = explosive.targetWorldX - explosive.worldX;
    const currentDy = explosive.targetWorldY - explosive.worldY;
    const speed = Math.sqrt(
      explosive.velocityX * explosive.velocityX +
        explosive.velocityY * explosive.velocityY,
    );
    const arrived =
      Math.sqrt(currentDx * currentDx + currentDy * currentDy) <=
        Math.max(EXPLOSIVE_RADIUS, speed / 20) ||
      prevDx * currentDx + prevDy * currentDy <= 0;

    if (!arrived) return;

    explosive.worldX = explosive.targetWorldX;
    explosive.worldY = explosive.targetWorldY;
    explosive.prevWorldX = explosive.worldX;
    explosive.prevWorldY = explosive.worldY;
    explosive.velocityX = 0;
    explosive.velocityY = 0;
    explosive.hasLanded = true;
    explosive.landingWorldX = explosive.worldX;
    explosive.landingWorldY = explosive.worldY;
    explosive.landingBounceCooldownTicks = 0;
    if (explosive.physicsBody) {
      explosive.physicsBody.setPosition(explosive.worldX, explosive.worldY);
    }
  }

  /**
   * Check line of sight between two points using raycast against walls
   */
  public hasLineOfSight(
    map: TileType[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): boolean {
    // Use grid-based Bresenham for performance (as suggested in plan)
    const gridX1 = Math.floor(x1 / CELL_CONFIG.w);
    const gridY1 = Math.floor(y1 / CELL_CONFIG.h);
    const gridX2 = Math.floor(x2 / CELL_CONFIG.w);
    const gridY2 = Math.floor(y2 / CELL_CONFIG.h);

    // Bresenham line algorithm
    const dx = Math.abs(gridX2 - gridX1);
    const dy = Math.abs(gridY2 - gridY1);
    const sx = gridX1 < gridX2 ? 1 : -1;
    const sy = gridY1 < gridY2 ? 1 : -1;
    let err = dx - dy;

    let x = gridX1;
    let y = gridY1;

    while (true) {
      // Check if current tile blocks sight
      const tile = tileAt(map, x, y);
      if (
        tile === TileType.WALL ||
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_LOCKED
      ) {
        // Don't count start/end tiles as blocking
        if ((x !== gridX1 || y !== gridY1) && (x !== gridX2 || y !== gridY2)) {
          return false;
        }
      }

      if (x === gridX2 && y === gridY2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return true;
  }

  /**
   * Get the physics system (for debugging)
   */
  public getSystem(): System {
    return this.system;
  }
}
