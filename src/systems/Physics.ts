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
import { GameState, EntityKind, TileType, CELL_CONFIG, MAP_WIDTH, MAP_HEIGHT } from "../types";
import { ContinuousEntity } from "../entities/ContinuousEntity";
import { PlayerEntity } from "../entities/Player";
import { MonsterEntity } from "../entities/Monster";
import { ItemEntity } from "../entities/Item";
import { BulletEntity } from "../entities/Bullet";
import { idx, tileAt } from "../utils/helpers";

// Collision radii - sized to allow smooth corridor navigation
// With 32px tiles, an 8px radius (16px diameter) leaves 16px clearance in corridors
const PLAYER_RADIUS = 8;
const MONSTER_RADIUS = 7;
const ITEM_RADIUS = 6;
const BULLET_RADIUS = 4;

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
          const worldX = x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
          const worldY = y * CELL_CONFIG.h + CELL_CONFIG.h / 2;

          // Try half-size boxes - detect-collisions may use half-extents
          const box = this.system.createBox(
            { x: worldX, y: worldY },
            CELL_CONFIG.w / 2, // Half-extent: 16px from center = 32px full width
            CELL_CONFIG.h / 2  // Half-extent: 16px from center = 32px full height
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
    } else {
      radius = 8; // Default
    }

    const circle = this.system.createCircle(
      { x: entity.worldX, y: entity.worldY },
      radius
    );

    // Items don't block movement
    if (entity.kind === EntityKind.ITEM) {
      circle.isTrigger = true;
    }

    // Bullets are triggers (don't physically block)
    if (entity.kind === EntityKind.BULLET) {
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
   */
  public updatePhysics(state: GameState, dt: number): void {
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

      // Skip if entity has no velocity (already stopped)
      if (entity.velocityX === 0 && entity.velocityY === 0) {
        continue;
      }

      // Check if entity has a target to move toward
      if (entity.targetWorldX !== undefined && entity.targetWorldY !== undefined) {
        const toTargetX = entity.targetWorldX - entity.worldX;
        const toTargetY = entity.targetWorldY - entity.worldY;
        const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
        
        // Calculate how far we would move this frame
        const moveDistance = Math.sqrt(entity.velocityX * entity.velocityX + entity.velocityY * entity.velocityY) * dt;
        
        // If we would overshoot target, snap to it and stop
        if (moveDistance >= distToTarget) {
          entity.worldX = entity.targetWorldX;
          entity.worldY = entity.targetWorldY;
          entity.velocityX = 0;
          entity.velocityY = 0;
          entity.targetWorldX = undefined;
          entity.targetWorldY = undefined;
        } else {
          // Move toward target
          entity.worldX += entity.velocityX * dt;
          entity.worldY += entity.velocityY * dt;
        }
      } else {
        // No target - just apply velocity (for bullets)
        entity.worldX += entity.velocityX * dt;
        entity.worldY += entity.velocityY * dt;
      }

      // Update physics body position
      if (entity.physicsBody) {
        entity.physicsBody.setPosition(entity.worldX, entity.worldY);
      }
    }

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

    // Wall collision - push entity out of wall with wall sliding
    if ((bodyA as any).isWall && entityB && entityB.kind !== EntityKind.ITEM) {
      // A is wall, B is entity - entity moves in POSITIVE overlapV direction (away from wall)
      entityB.worldX += response.overlapV.x;
      entityB.worldY += response.overlapV.y;
      
      // Wall sliding: Only cancel velocity INTO the wall
      // If overlap is primarily horizontal, cancel X velocity
      // If overlap is primarily vertical, cancel Y velocity
      const absOverlapX = Math.abs(response.overlapV.x);
      const absOverlapY = Math.abs(response.overlapV.y);
      
      if (absOverlapX > absOverlapY) {
        // Horizontal wall hit - cancel X velocity only
        entityB.velocityX = 0;
        if (entityB.targetWorldX !== undefined) {
          entityB.targetWorldX = entityB.worldX; // Snap target X to current
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall hit - cancel Y velocity only
        entityB.velocityY = 0;
        if (entityB.targetWorldY !== undefined) {
          entityB.targetWorldY = entityB.worldY; // Snap target Y to current
        }
      } else {
        // Corner hit - cancel all velocity
        entityB.velocityX = 0;
        entityB.velocityY = 0;
        entityB.targetWorldX = undefined;
        entityB.targetWorldY = undefined;
      }
      
      if (entityB.physicsBody) {
        entityB.physicsBody.setPosition(entityB.worldX, entityB.worldY);
      }
    } else if ((bodyB as any).isWall && entityA && entityA.kind !== EntityKind.ITEM) {
      // B is wall, A is entity - entity moves in NEGATIVE overlapV direction (away from wall)
      entityA.worldX -= response.overlapV.x;
      entityA.worldY -= response.overlapV.y;
      
      // Wall sliding: Only cancel velocity INTO the wall
      const absOverlapX = Math.abs(response.overlapV.x);
      const absOverlapY = Math.abs(response.overlapV.y);
      
      if (absOverlapX > absOverlapY) {
        // Horizontal wall hit - cancel X velocity only
        entityA.velocityX = 0;
        if (entityA.targetWorldX !== undefined) {
          entityA.targetWorldX = entityA.worldX;
        }
      } else if (absOverlapY > absOverlapX) {
        // Vertical wall hit - cancel Y velocity only
        entityA.velocityY = 0;
        if (entityA.targetWorldY !== undefined) {
          entityA.targetWorldY = entityA.worldY;
        }
      } else {
        // Corner hit - cancel all velocity
        entityA.velocityX = 0;
        entityA.velocityY = 0;
        entityA.targetWorldX = undefined;
        entityA.targetWorldY = undefined;
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
    body: Circle | Box
  ): ContinuousEntity | undefined {
    const entityId = (body as any).entityId;
    if (entityId === undefined) return undefined;

    const entity = state.entities.find((e) => e.id === entityId);
    if (entity && (entity instanceof ContinuousEntity || entity instanceof PlayerEntity || entity instanceof MonsterEntity || entity instanceof ItemEntity || entity instanceof BulletEntity)) {
      return entity as ContinuousEntity;
    }
    return undefined;
  }

  /**
   * Update bullets - move, check collisions, apply damage
   */
  public updateBullets(state: GameState, dt: number): void {
    const bullets = state.entities.filter(
      (e): e is BulletEntity => e.kind === EntityKind.BULLET && e instanceof BulletEntity
    );

    for (const bullet of bullets) {
      // Track distance traveled
      const distanceThisFrame = Math.sqrt(
        bullet.velocityX * bullet.velocityX +
        bullet.velocityY * bullet.velocityY
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
            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            bulletRemoved = true;
            return;
          }

          // Hit monster
          const targetEntity = this.getEntityFromBody(state, other as Circle | Box);
          if (
            targetEntity &&
            targetEntity.kind === EntityKind.MONSTER &&
            targetEntity.id !== bullet.ownerId
          ) {
            // Apply damage
            const monster = targetEntity as MonsterEntity;
            monster.hp -= bullet.damage;
            
            // Check if monster died
            if (monster.hp <= 0) {
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
          }
        });
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
    y2: number
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
