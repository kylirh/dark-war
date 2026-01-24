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
  CELL_CONFIG,
  MAP_WIDTH,
  MAP_HEIGHT,
  EventType,
} from "../types";
import { ContinuousEntity } from "../entities/ContinuousEntity";
import { PlayerEntity } from "../entities/Player";
import { MonsterEntity } from "../entities/Monster";
import { ItemEntity } from "../entities/Item";
import { BulletEntity } from "../entities/Bullet";
import { ExplosiveEntity } from "../entities/Explosive";
import { idx, tileAt } from "../utils/helpers";
import { Sound, SoundEffect } from "./Sound";
import { pushEvent } from "./Simulation";

// Collision radii - sized to allow smooth corridor navigation
// With 32px tiles, an 8px radius (16px diameter) leaves 16px clearance in corridors
const PLAYER_RADIUS = 8;
const MONSTER_RADIUS = 7;
const ITEM_RADIUS = 6;
const BULLET_RADIUS = 4;
const EXPLOSIVE_RADIUS = 6;

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

          this.wallBodies.set(tileIndex, box);
        }
      }
    }
  }

  /**
   * Add or update entity physics body
   */
  public updateEntityBody(entity: ContinuousEntity): void {
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
  public removeEntity(entity: ContinuousEntity): void {
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
      if (entity instanceof ContinuousEntity && !entity.physicsBody) {
        this.updateEntityBody(entity);
      }
    }

    // Process each entity
    for (const entity of state.entities) {
      if (!(entity instanceof ContinuousEntity)) continue;

      // Items are static - never move them
      if (entity.kind === EntityKind.ITEM) {
        continue;
      }

      // Skip if entity has no velocity
      if (entity.velocityX === 0 && entity.velocityY === 0) {
        continue;
      }

      // Apply velocity directly (continuous movement, no targets)
      entity.worldX += entity.velocityX * dt;
      entity.worldY += entity.velocityY * dt;

      // Update physics body position
      if (entity.physicsBody) {
        entity.physicsBody.setPosition(entity.worldX, entity.worldY);
      }
    }

    // Update spatial hash after moving all entities
    this.system.update();

    // Check and resolve collisions
    this.system.checkAll((response) => {
      this.handleCollision(state, response);
    });
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

    if (
      entityA?.kind === EntityKind.BULLET ||
      entityA?.kind === EntityKind.EXPLOSIVE ||
      entityB?.kind === EntityKind.BULLET ||
      entityB?.kind === EntityKind.EXPLOSIVE
    ) {
      return;
    }

    // Wall collision - push entity out of wall with wall sliding
    if ((bodyA as any).isWall && entityB && entityB.kind !== EntityKind.ITEM) {
      // Push entity out with small safety margin to prevent tunneling
      const separation = 1.01; // 1% extra separation
      entityB.worldX += response.overlapV.x * separation;
      entityB.worldY += response.overlapV.y * separation;

      // Wall sliding: Only cancel velocity component pushing INTO the wall
      const absOverlapX = Math.abs(response.overlapV.x);
      const absOverlapY = Math.abs(response.overlapV.y);

      if (absOverlapX > absOverlapY) {
        // Horizontal wall - only cancel X velocity if moving into wall
        if ((response.overlapV.x > 0 && entityB.velocityX < 0) ||
            (response.overlapV.x < 0 && entityB.velocityX > 0)) {
          entityB.velocityX = 0;
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall - only cancel Y velocity if moving into wall
        if ((response.overlapV.y > 0 && entityB.velocityY < 0) ||
            (response.overlapV.y < 0 && entityB.velocityY > 0)) {
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
      entityA.kind !== EntityKind.ITEM
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
        if ((response.overlapV.x > 0 && entityA.velocityX > 0) ||
            (response.overlapV.x < 0 && entityA.velocityX < 0)) {
          entityA.velocityX = 0;
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall - only cancel Y velocity if moving into wall
        if ((response.overlapV.y > 0 && entityA.velocityY > 0) ||
            (response.overlapV.y < 0 && entityA.velocityY < 0)) {
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
    }
  }

  /**
   * Get entity from physics body
   */
  private getEntityFromBody(
    state: GameState,
    body: Circle | Box,
  ): ContinuousEntity | undefined {
    const entityId = (body as any).entityId;
    if (entityId === undefined) return undefined;

    const entity = state.entities.find((e) => e.id === entityId);
    if (
      entity &&
      (entity instanceof ContinuousEntity ||
        entity instanceof PlayerEntity ||
        entity instanceof MonsterEntity ||
        entity instanceof ItemEntity ||
        entity instanceof BulletEntity ||
        entity instanceof ExplosiveEntity)
    ) {
      return entity as ContinuousEntity;
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

    const ricochetChance = 0.35;
    const ricochetAngleThreshold = 0.55;
    const ricochetDamping = 0.8;
    const knockbackLight = 85;

    for (const bullet of bullets) {
      // Track distance traveled
      const distanceThisFrame =
        Math.sqrt(
          bullet.velocityX * bullet.velocityX +
            bullet.velocityY * bullet.velocityY,
        ) * dt;
      bullet.traveledDistance += distanceThisFrame;

      // Remove if exceeded max distance
      if (bullet.traveledDistance >= bullet.maxDistance) {
        this.removeEntity(bullet);
        const index = state.entities.indexOf(bullet);
        if (index > -1) state.entities.splice(index, 1);
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
            const speed = Math.sqrt(
              bullet.velocityX * bullet.velocityX +
                bullet.velocityY * bullet.velocityY,
            );
            const normalLength = Math.sqrt(
              response.overlapV.x * response.overlapV.x +
                response.overlapV.y * response.overlapV.y,
            );
            const canRicochet =
              bullet.ricochetsRemaining > 0 &&
              speed > 0 &&
              normalLength > 0;

            if (canRicochet) {
              const nx = response.overlapV.x / normalLength;
              const ny = response.overlapV.y / normalLength;
              const incidence = Math.abs(
                (bullet.velocityX * nx + bullet.velocityY * ny) / speed,
              );

              if (
                incidence < ricochetAngleThreshold &&
                Math.random() < ricochetChance
              ) {
                const dot = bullet.velocityX * nx + bullet.velocityY * ny;
                bullet.velocityX =
                  (bullet.velocityX - 2 * dot * nx) * ricochetDamping;
                bullet.velocityY =
                  (bullet.velocityY - 2 * dot * ny) * ricochetDamping;
                bullet.facingAngle = Math.atan2(
                  bullet.velocityY,
                  bullet.velocityX,
                );
                bullet.ricochetsRemaining -= 1;
                bullet.worldX -= response.overlapV.x * 1.01;
                bullet.worldY -= response.overlapV.y * 1.01;
                if (bullet.physicsBody) {
                  bullet.physicsBody.setPosition(bullet.worldX, bullet.worldY);
                }
                return;
              }
            }

            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            bulletRemoved = true;
            return;
          }

          // Hit monster
          const targetEntity = this.getEntityFromBody(
            state,
            other as Circle | Box,
          );
          if (!targetEntity) return;

          if (
            targetEntity.kind === EntityKind.MONSTER &&
            targetEntity.id !== bullet.ownerId
          ) {
            // Apply damage
            const monster = targetEntity as MonsterEntity;
            monster.hp -= bullet.damage;

            const speed = Math.sqrt(
              bullet.velocityX * bullet.velocityX +
                bullet.velocityY * bullet.velocityY,
            );
            if (speed > 0) {
              monster.velocityX += (bullet.velocityX / speed) * knockbackLight;
              monster.velocityY += (bullet.velocityY / speed) * knockbackLight;
            }

            // Check if monster died
            if (monster.hp <= 0) {
              Sound.play(SoundEffect.MONSTER_DEATH);

              // Remove dead monster
              this.removeEntity(monster);
              const monsterIdx = state.entities.indexOf(monster);
              if (monsterIdx > -1) state.entities.splice(monsterIdx, 1);

              // Award score
              state.player.score += 15;
            }

            // Remove bullet
            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            bulletRemoved = true;
          } else if (
            targetEntity.kind === EntityKind.PLAYER &&
            (targetEntity.id !== bullet.ownerId ||
              bullet.ricochetsRemaining < 1)
          ) {
            const player = targetEntity as PlayerEntity;
            if (player.hp > 0) {
              const speed = Math.sqrt(
                bullet.velocityX * bullet.velocityX +
                  bullet.velocityY * bullet.velocityY,
              );
              if (speed > 0) {
                player.velocityX +=
                  (bullet.velocityX / speed) * knockbackLight;
                player.velocityY +=
                  (bullet.velocityY / speed) * knockbackLight;
              }
              pushEvent(state, {
                type: EventType.DAMAGE,
                data: {
                  type: "DAMAGE",
                  targetId: player.id,
                  amount: bullet.damage,
                },
              });
            }

            // Remove bullet
            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            bulletRemoved = true;
          }
        });
      }
    }
  }

  /**
   * Update explosives - move, check collisions with monsters and walls
   */
  public updateExplosives(state: GameState, dt: number): void {
    const explosives = state.entities.filter(
      (e): e is ExplosiveEntity =>
        e.kind === EntityKind.EXPLOSIVE && e instanceof ExplosiveEntity,
    );

    const ricochetDamping = 0.6;

    for (const explosive of explosives) {
      // Only check collisions for moving explosives (grenades in flight)
      if (
        explosive.velocityX === 0 &&
        explosive.velocityY === 0
      ) {
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
          if ((other as any).isWall) {
            const speed = Math.sqrt(
              explosive.velocityX * explosive.velocityX +
                explosive.velocityY * explosive.velocityY,
            );
            const normalLength = Math.sqrt(
              response.overlapV.x * response.overlapV.x +
                response.overlapV.y * response.overlapV.y,
            );
            if (speed > 0 && normalLength > 0) {
              const nx = response.overlapV.x / normalLength;
              const ny = response.overlapV.y / normalLength;
              const dot = explosive.velocityX * nx + explosive.velocityY * ny;
              explosive.velocityX =
                (explosive.velocityX - 2 * dot * nx) * ricochetDamping;
              explosive.velocityY =
                (explosive.velocityY - 2 * dot * ny) * ricochetDamping;
            }

            explosive.worldX -= response.overlapV.x * 1.01;
            explosive.worldY -= response.overlapV.y * 1.01;
            if (explosive.physicsBody) {
              explosive.physicsBody.setPosition(
                explosive.worldX,
                explosive.worldY,
              );
            }
            return;
          }

          // Hit monster or player - explode
          const targetEntity = this.getEntityFromBody(
            state,
            other as Circle | Box,
          );
          if (
            targetEntity &&
            (targetEntity.kind === EntityKind.MONSTER ||
              targetEntity.kind === EntityKind.PLAYER)
          ) {
            explosive.directHitTargetId = targetEntity.id;
            shouldExplode = true;
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
