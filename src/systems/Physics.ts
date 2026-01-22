/**
 * Physics system using detect-collisions for continuous movement
 * Handles entity movement, collision detection, wall sliding, and soft separation
 */

import { System, Circle, Box, Response } from "detect-collisions";
import { GameState, EntityKind, TileType, CELL_CONFIG, MAP_WIDTH, MAP_HEIGHT } from "../types";
import { ContinuousEntity } from "../entities/ContinuousEntity";
import { PlayerEntity } from "../entities/Player";
import { MonsterEntity } from "../entities/Monster";
import { ItemEntity } from "../entities/Item";
import { BulletEntity } from "../entities/Bullet";
import { idx, tileAt } from "../utils/helpers";

// Physics constants
const PLAYER_RADIUS = 12; // pixels
const MONSTER_RADIUS = 10; // pixels
const ITEM_RADIUS = 8; // pixels
const BULLET_RADIUS = 3; // pixels
const SEPARATION_FORCE = 0.05; // 5% repulsion per frame
const WALL_FRICTION = 0.95; // Slight dampening on wall collision

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

          const box = this.system.createBox(
            { x: worldX, y: worldY },
            CELL_CONFIG.w,
            CELL_CONFIG.h
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

    // Store previous positions for all entities
    for (const entity of state.entities) {
      if (entity instanceof ContinuousEntity) {
        entity.storePreviousPosition();
      }
    }

    // Update positions based on velocity
    for (const entity of state.entities) {
      if (!(entity instanceof ContinuousEntity)) continue;

      // Items don't move - skip velocity integration
      if (entity.kind === EntityKind.ITEM) {
        continue;
      }

      // Check if entity has reached target (for planning mode)
      if (entity.targetWorldX !== undefined && entity.targetWorldY !== undefined) {
        if (entity.hasReachedTarget(2)) {
          // Stop movement and clear target
          entity.velocityX = 0;
          entity.velocityY = 0;
          entity.clearTarget();
          
          // Snap to exact target position
          entity.worldX = entity.targetWorldX;
          entity.worldY = entity.targetWorldY;
        }
      }

      // Integrate velocity
      entity.worldX += entity.velocityX * dt;
      entity.worldY += entity.velocityY * dt;

      // Update physics body position
      if (entity.physicsBody) {
        entity.physicsBody.setPosition(entity.worldX, entity.worldY);
      }
    }

    // Check collisions
    this.system.checkAll((response) => {
      this.handleCollision(state, response);
    });

    // Apply soft separation between entities (monsters only)
    this.applySoftSeparation(state);
  }

  /**
   * Handle collision between two bodies
   */
  private handleCollision(state: GameState, response: Response): void {
    const bodyA = response.a;
    const bodyB = response.b;

    // Get entity references
    const entityA = this.getEntityFromBody(state, bodyA);
    const entityB = this.getEntityFromBody(state, bodyB);

    // Wall collision - apply sliding
    if ((bodyA as any).isWall && entityB) {
      this.applyWallSliding(entityB, response);
    } else if ((bodyB as any).isWall && entityA) {
      // Swap response
      const swappedResponse = {
        ...response,
        a: bodyB,
        b: bodyA,
        overlapV: {
          x: -response.overlapV.x,
          y: -response.overlapV.y,
        },
      } as Response;
      this.applyWallSliding(entityA, swappedResponse);
    }

    // Entity-entity collision (block non-triggers)
    if (entityA && entityB) {
      // Only apply blocking for solid entities (not items/bullets)
      if (
        !bodyA.isTrigger &&
        !bodyB.isTrigger &&
        entityA.kind !== EntityKind.ITEM &&
        entityB.kind !== EntityKind.ITEM &&
        entityA.kind !== EntityKind.BULLET &&
        entityB.kind !== EntityKind.BULLET
      ) {
        // Push entities apart equally
        entityA.worldX -= response.overlapV.x * 0.5;
        entityA.worldY -= response.overlapV.y * 0.5;
        entityB.worldX += response.overlapV.x * 0.5;
        entityB.worldY += response.overlapV.y * 0.5;

        if (entityA.physicsBody) {
          entityA.physicsBody.setPosition(entityA.worldX, entityA.worldY);
        }
        if (entityB.physicsBody) {
          entityB.physicsBody.setPosition(entityB.worldX, entityB.worldY);
        }
      }
    }
  }

  /**
   * Apply wall sliding (zero out velocity perpendicular to wall)
   */
  private applyWallSliding(entity: ContinuousEntity, response: Response): void {
    // Push entity out of wall
    entity.worldX -= response.overlapV.x;
    entity.worldY -= response.overlapV.y;

    if (entity.physicsBody) {
      entity.physicsBody.setPosition(entity.worldX, entity.worldY);
    }

    // Calculate wall normal (normalized overlap vector)
    const normalX = response.overlapV.x;
    const normalY = response.overlapV.y;
    const length = Math.sqrt(normalX * normalX + normalY * normalY);

    if (length > 0) {
      const nx = normalX / length;
      const ny = normalY / length;

      // Project velocity onto wall normal and subtract (slide along wall)
      const dot = entity.velocityX * nx + entity.velocityY * ny;
      entity.velocityX -= dot * nx;
      entity.velocityY -= dot * ny;

      // Apply friction
      entity.velocityX *= WALL_FRICTION;
      entity.velocityY *= WALL_FRICTION;
    }
  }

  /**
   * Apply soft separation force between overlapping entities
   */
  private applySoftSeparation(state: GameState): void {
    const entities: ContinuousEntity[] = [];
    for (const e of state.entities) {
      if (
        (e.kind === EntityKind.MONSTER || e.kind === EntityKind.PLAYER) &&
        (e instanceof PlayerEntity || e instanceof MonsterEntity)
      ) {
        entities.push(e);
      }
    }

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entityA = entities[i];
        const entityB = entities[j];

        const dx = entityB.worldX - entityA.worldX;
        const dy = entityB.worldY - entityA.worldY;
        const distSq = dx * dx + dy * dy;

        // Check if overlapping (using sum of radii)
        const radiusA = entityA.kind === EntityKind.PLAYER ? PLAYER_RADIUS : MONSTER_RADIUS;
        const radiusB = entityB.kind === EntityKind.PLAYER ? PLAYER_RADIUS : MONSTER_RADIUS;
        const minDist = radiusA + radiusB;

        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;

          // Normalize direction
          const nx = dx / dist;
          const ny = dy / dist;

          // Apply small repulsion force
          const forceX = nx * overlap * SEPARATION_FORCE;
          const forceY = ny * overlap * SEPARATION_FORCE;

          entityA.velocityX -= forceX;
          entityA.velocityY -= forceY;
          entityB.velocityX += forceX;
          entityB.velocityY += forceY;
        }
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

      // Check collision with walls
      if (bullet.physicsBody) {
        const potentials = this.system.getPotentials(bullet.physicsBody);
        
        for (const other of potentials) {
          // Hit wall
          if ((other as any).isWall) {
            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            break;
          }

          // Hit monster
          const targetEntity = this.getEntityFromBody(state, other as Circle | Box);
          if (
            targetEntity &&
            targetEntity.kind === EntityKind.MONSTER &&
            targetEntity.id !== bullet.ownerId
          ) {
            // Apply damage (will be handled by combat system event)
            const monster = targetEntity as MonsterEntity;
            monster.hp -= bullet.damage;

            // Remove bullet
            this.removeEntity(bullet);
            const index = state.entities.indexOf(bullet);
            if (index > -1) state.entities.splice(index, 1);
            break;
          }
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
