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
  MonsterType,
  Monster,
  EventType,
  CELL_CONFIG,
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_DEFINITIONS,
} from "../types";
import { RNG } from "../utils/rng";
import { GameEntity } from "../entities/game-entity";
import { BulletEntity } from "../entities/bullet-entity";
import { ItemEntity } from "../entities/item-entity";
import { ExplosiveEntity } from "../entities/explosive-entity";
import { TileSource } from "../core/tile-source";
import { idxFor, tileAtFor } from "../utils/helpers";
import { wrapValue } from "../utils/wrap";
import { applyWallDamageAtIndex } from "../utils/walls";

import { pushEvent } from "./simulation/sim-helpers";

// Collision radii - sized to allow smooth corridor navigation
// With 32px tiles, an 8px radius (16px diameter) leaves 16px clearance in corridors
const PLAYER_RADIUS = 8;
const MONSTER_RADIUS = 7;
const ITEM_RADIUS = 6;
const BULLET_RADIUS = 4;
// Max distance a bullet advances per collision sub-step. Smaller than the
// bullet+actor overlap radius so fast bullets can't tunnel through enemies.
const BULLET_SUBSTEP_PX = 6;
const EXPLOSIVE_RADIUS = 6;
// Thrown-item (bone/rock) physics: speed decay per frame, rest threshold, and
// energy kept after a wall bounce.
const THROWN_FRICTION = 0.92;
const THROWN_REST_SPEED = 35;
const THROWN_BOUNCE_DAMP = 0.6;
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
  private entityBodies: Map<string, Circle> = new Map(); // entityId -> Circle

  constructor() {
    this.system = new System();
  }

  /**
   * Build static wall colliders for a level by reading tiles through a
   * TileSource. For a flat (finite) level this iterates the whole map; a
   * streaming source must be finite here (a future chunk-streaming path will
   * build/drop wall bodies per loaded chunk instead).
   */
  public initializeMap(tiles: TileSource): void {
    const width = tiles.width;
    const height = tiles.height;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error("initializeMap requires a bounded TileSource");
    }

    // Clear existing wall bodies
    for (const body of this.wallBodies.values()) {
      this.system.remove(body);
    }
    this.wallBodies.clear();

    // Only walls that border passable space get colliders — interior solid rock
    // is unreachable, so skipping it keeps body counts low enough for large
    // (streamed) maps without changing what the player can actually collide with.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.ensureWallBody(tiles, x, y);
      }
    }
  }

  /**
   * Reconcile a single tile's wall collider with the world: a collider exists
   * iff the tile blocks AND borders a passable tile. Used incrementally when a
   * tile changes (door, destroyed wall, newly streamed-in chunk).
   */
  public updateTile(tiles: TileSource, x: number, y: number): void {
    // The tile itself plus its 4 neighbours may gain/lose "borders passable"
    // status, so re-evaluate all five.
    this.ensureWallBody(tiles, x, y);
    this.ensureWallBody(tiles, x + 1, y);
    this.ensureWallBody(tiles, x - 1, y);
    this.ensureWallBody(tiles, x, y + 1);
    this.ensureWallBody(tiles, x, y - 1);
  }

  private bordersPassable(tiles: TileSource, x: number, y: number): boolean {
    return (
      tiles.passable(x + 1, y) ||
      tiles.passable(x - 1, y) ||
      tiles.passable(x, y + 1) ||
      tiles.passable(x, y - 1)
    );
  }

  /** Create or remove the wall collider for one tile to match the world. */
  private ensureWallBody(tiles: TileSource, x: number, y: number): void {
    if (!tiles.inBounds(x, y)) return;
    const tileIndex = idxFor(x, y, tiles.width);
    const tile = tiles.getTile(x, y);
    const shouldBlock =
      !!TILE_DEFINITIONS[tile]?.block && this.bordersPassable(tiles, x, y);
    const existing = this.wallBodies.get(tileIndex);

    if (shouldBlock && !existing) {
      const box = this.system.createBox(
        { x: x * CELL_CONFIG.w, y: y * CELL_CONFIG.h },
        CELL_CONFIG.w,
        CELL_CONFIG.h,
      );
      box.isStatic = true;
      (box as any).isWall = true;
      (box as any).tileIndex = tileIndex;
      this.wallBodies.set(tileIndex, box);
    } else if (!shouldBlock && existing) {
      this.system.remove(existing);
      this.wallBodies.delete(tileIndex);
    }
  }

  /**
   * Add or update entity physics body
   */
  public updateEntityBody(entity: GameEntity): void {
    // Remove any existing body for this entity. We check both the instance's
    // own reference and the id index, because the client recreates entity
    // instances on each snapshot (the new instance has no physicsBody but a
    // stale body may still live in the system under the same id).
    const staleById = this.entityBodies.get(entity.id);
    if (staleById) this.system.remove(staleById);
    if (entity.physicsBody && entity.physicsBody !== staleById) {
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
    this.entityBodies.set(entity.id, circle);
  }

  /**
   * Remove entity from physics system
   */
  public removeEntity(entity: GameEntity): void {
    if (entity.physicsBody) {
      this.system.remove(entity.physicsBody);
      entity.physicsBody = undefined;
    }
    this.entityBodies.delete(entity.id);
  }

  /**
   * Remove all non-wall bodies before a full entity rebuild.
   */
  public clearEntityBodies(): void {
    for (const body of this.system.all()) {
      if (!(body as any).isWall) {
        this.system.remove(body);
      }
    }
    this.entityBodies.clear();
  }

  /**
   * Incrementally reconcile physics bodies with the entity manager's
   * spawn/despawn tracking. Replaces the per-frame full-scan reconcile:
   * only entities that actually appeared or disappeared are touched.
   * Clears the lifecycle tracking once applied.
   */
  public syncEntityBodies(state: GameState): void {
    const manager = state.entityManager;

    for (const id of manager.removedIds) {
      const body = this.entityBodies.get(id);
      if (body) {
        this.system.remove(body);
        this.entityBodies.delete(id);
      }
    }

    for (const id of manager.spawnedIds) {
      const entity = manager.getById(id);
      if (entity instanceof GameEntity && !entity.physicsBody) {
        this.updateEntityBody(entity);
      }
    }

    manager.clearLifecycle();
  }

  /**
   * Rebuild the entire physics world from scratch: wall bodies from the map
   * plus fresh bodies for every current entity. Used on level transitions and
   * after deserialize, replacing the old manual init + clear + recreate dance.
   */
  public rebuildAll(state: GameState): void {
    this.initializeMap(state.tiles);
    this.clearEntityBodies();
    for (const entity of state.entities) {
      if (entity instanceof GameEntity) {
        entity.physicsBody = undefined;
        this.updateEntityBody(entity);
      }
    }
    state.entityManager.clearLifecycle();
  }

  /**
   * Client-side prediction: advance a single entity (the local player) against
   * walls only — no entity-entity collisions, no simulation. Lets local input
   * feel instant while the server stays authoritative and corrects via
   * reconciliation. Wall bodies must already be initialized (initializeMap).
   *
   * The wall-slide resolution mirrors the entityA branch of handleCollision;
   * checkOne() reports the queried body as response.a and the wall as
   * response.b, so the player is pushed out by -overlapV.
   */
  public predictLocalMovement(
    state: GameState,
    entity: GameEntity,
    dt: number,
  ): void {
    if (!entity.physicsBody) this.updateEntityBody(entity);
    const body = entity.physicsBody;
    if (!body) return;

    entity.prevWorldX = entity.worldX;
    entity.prevWorldY = entity.worldY;

    if (entity.velocityX !== 0 || entity.velocityY !== 0) {
      entity.worldX += entity.velocityX * dt;
      entity.worldY += entity.velocityY * dt;

      if (state.levelKind === "outside") {
        // Toroidal world: fall off one edge, reappear on the other.
        entity.worldX = wrapValue(
          entity.worldX,
          state.mapWidth * CELL_CONFIG.w,
        );
        entity.worldY = wrapValue(
          entity.worldY,
          state.mapHeight * CELL_CONFIG.h,
        );
      } else {
        const minBound = CELL_CONFIG.w + PLAYER_RADIUS;
        const maxBoundX = (state.mapWidth - 1) * CELL_CONFIG.w - PLAYER_RADIUS;
        const maxBoundY = (state.mapHeight - 1) * CELL_CONFIG.h - PLAYER_RADIUS;
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
      }
    }

    body.setPosition(entity.worldX, entity.worldY);
    this.system.update();

    for (let i = 0; i < COLLISION_RESOLUTION_ITERATIONS; i++) {
      let collided = false;
      this.system.checkOne(body, (response) => {
        if (!(response.b as any).isWall) return;
        collided = true;
        this.resolvePredictedWallCollision(entity, response);
      });
      if (!collided) break;
      this.system.update();
    }
  }

  /**
   * Push a predicted entity out of a wall with sliding. Mirrors the entityA
   * branch of handleCollision (queried body is response.a, wall is response.b).
   */
  private resolvePredictedWallCollision(
    entity: GameEntity,
    response: Response,
  ): void {
    const separation = 1.01;
    entity.worldX -= response.overlapV.x * separation;
    entity.worldY -= response.overlapV.y * separation;

    const absOverlapX = Math.abs(response.overlapV.x);
    const absOverlapY = Math.abs(response.overlapV.y);

    if (absOverlapX > absOverlapY) {
      if (
        (response.overlapV.x > 0 && entity.velocityX > 0) ||
        (response.overlapV.x < 0 && entity.velocityX < 0)
      ) {
        entity.velocityX = 0;
      }
    } else if (absOverlapY > absOverlapX) {
      if (
        (response.overlapV.y > 0 && entity.velocityY > 0) ||
        (response.overlapV.y < 0 && entity.velocityY < 0)
      ) {
        entity.velocityY = 0;
      }
    } else {
      entity.velocityX = 0;
      entity.velocityY = 0;
    }

    entity.physicsBody?.setPosition(entity.worldX, entity.worldY);
  }

  /**
   * Update physics for all entities
   * @param state Game state
   * @param dt Delta time in seconds (already scaled by timeScale * REAL_TIME_SPEED)
   */
  public updatePhysics(state: GameState, dt: number): void {
    // Reconcile bodies for entities spawned/despawned since the last frame.
    this.syncEntityBodies(state);

    // Build entity Map once for O(1) lookup in collision handlers
    const entityMap = new Map<string, GameEntity>();
    for (const entity of state.entities) {
      if (entity instanceof GameEntity) {
        entityMap.set(entity.id, entity);
      }
    }

    // Process each entity
    for (const entity of state.entities) {
      if (!(entity instanceof GameEntity)) continue;

      // Items are static - never move them
      if (entity.kind === EntityKind.ITEM) {
        continue;
      }

      // Bullets are moved+collided in updateBullets, sub-stepped to avoid
      // tunnelling through enemies at high speed / low tick rates.
      if (entity.kind === EntityKind.BULLET) {
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

      if (state.levelKind === "outside") {
        // Toroidal world: wrap entities around the seam instead of clamping.
        entity.worldX = wrapValue(
          entity.worldX,
          state.mapWidth * CELL_CONFIG.w,
        );
        entity.worldY = wrapValue(
          entity.worldY,
          state.mapHeight * CELL_CONFIG.h,
        );
      } else {
        // Clamp to world bounds to prevent entities escaping the map.
        // (Bullets are handled in updateBullets and skipped above.)
        const entityRadius =
          entity.kind === EntityKind.PLAYER
            ? PLAYER_RADIUS
            : entity.kind === EntityKind.MONSTER
              ? MONSTER_RADIUS
              : entity.kind === EntityKind.EXPLOSIVE
                ? EXPLOSIVE_RADIUS
                : 8;
        const minBound = CELL_CONFIG.w + entityRadius;
        const maxBoundX = (state.mapWidth - 1) * CELL_CONFIG.w - entityRadius;
        const maxBoundY = (state.mapHeight - 1) * CELL_CONFIG.h - entityRadius;

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
        this.handleCollision(entityMap, response);
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
  private handleCollision(
    entityMap: Map<string, GameEntity>,
    response: Response,
  ): void {
    const bodyA = response.a;
    const bodyB = response.b;

    // Get entity references
    const entityA = this.getEntityFromBody(entityMap, bodyA);
    const entityB = this.getEntityFromBody(entityMap, bodyB);

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
    return (
      entity.kind === EntityKind.PLAYER || entity.kind === EntityKind.MONSTER
    );
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
   * Get entity from physics body using the pre-built entity Map for O(1) lookup.
   */
  private getEntityFromBody(
    entityMap: Map<string, GameEntity>,
    body: Circle | Box,
  ): GameEntity | undefined {
    const entityId = (body as any).entityId;
    if (entityId === undefined) return undefined;
    return entityMap.get(entityId);
  }

  /**
   * Update bullets - move, check collisions, apply damage
   */
  public updateBullets(state: GameState, dt: number): void {
    const entityMap = new Map<string, GameEntity>();
    const bullets: BulletEntity[] = [];
    for (const e of state.entities) {
      if (e instanceof GameEntity) entityMap.set(e.id, e);
      if (e.kind === EntityKind.BULLET && e instanceof BulletEntity)
        bullets.push(e);
    }

    for (const bullet of bullets) {
      bullet.fuseSeconds -= dt;
      if (bullet.ownerGraceSeconds > 0) {
        bullet.ownerGraceSeconds = Math.max(0, bullet.ownerGraceSeconds - dt);
      }
      if (bullet.fuseSeconds <= 0) {
        if (bullet.thrownItem) {
          this.dropThrownItem(state, bullet);
        } else {
          this.removeStateEntity(state, bullet);
        }
        continue;
      }
      if (!bullet.physicsBody) continue;

      // Thrown items (bones/rocks) lose speed to friction and drop once they
      // come to rest, rather than flying forever / vanishing.
      if (bullet.thrownItem) {
        bullet.velocityX *= THROWN_FRICTION;
        bullet.velocityY *= THROWN_FRICTION;
        if (
          Math.hypot(bullet.velocityX, bullet.velocityY) < THROWN_REST_SPEED
        ) {
          this.dropThrownItem(state, bullet);
          continue;
        }
      }

      const speed = Math.hypot(bullet.velocityX, bullet.velocityY);
      const frameDistance = speed * dt;

      // Sub-step the movement so a fast bullet can't skip over (tunnel through)
      // an enemy between frames — the root cause of "bullets pass through".
      const substeps = Math.max(
        1,
        Math.ceil(frameDistance / BULLET_SUBSTEP_PX),
      );
      const stepDt = dt / substeps;

      // prevWorld marks the whole frame's start (used for render interpolation).
      bullet.prevWorldX = bullet.worldX;
      bullet.prevWorldY = bullet.worldY;

      const wraps = state.levelKind === "outside";
      const worldW = state.mapWidth * CELL_CONFIG.w;
      const worldH = state.mapHeight * CELL_CONFIG.h;

      for (let s = 0; s < substeps; s++) {
        bullet.worldX += bullet.velocityX * stepDt;
        bullet.worldY += bullet.velocityY * stepDt;
        bullet.traveledDistance += speed * stepDt;

        if (bullet.traveledDistance >= bullet.maxDistance) {
          this.removeStateEntity(state, bullet);
          break;
        }

        if (wraps) {
          // Bullets cross the toroidal seam so shots can hit the far edge.
          bullet.worldX = wrapValue(bullet.worldX, worldW);
          bullet.worldY = wrapValue(bullet.worldY, worldH);
        }

        bullet.physicsBody.setPosition(bullet.worldX, bullet.worldY);
        this.system.update();

        if (this.resolveBulletCollision(state, bullet, entityMap)) break;
      }
    }
  }

  /**
   * Resolve a bullet's collisions at its current position. Returns true if the
   * bullet should stop advancing this frame (it was removed or ricocheted).
   */
  private resolveBulletCollision(
    state: GameState,
    bullet: BulletEntity,
    entityMap: Map<string, GameEntity>,
  ): boolean {
    if (!bullet.physicsBody) return true;
    let stop = false;

    this.system.checkOne(bullet.physicsBody, (response) => {
      if (stop) return;
      const other = response.b;

      // Hit wall
      if ((other as any).isWall) {
        // Thrown items bounce off walls (no wall damage) and keep going.
        if (bullet.thrownItem) {
          this.bounceThrownItem(bullet, response);
          stop = true;
          return;
        }
        const tileIndex = (other as any).tileIndex;
        const ricocheted = this.tryRicochetBullet(bullet, response);
        if (!ricocheted && typeof tileIndex === "number") {
          applyWallDamageAtIndex(state, tileIndex, bullet.damage);
        }
        if (!ricocheted) {
          const baseAngle =
            Math.atan2(bullet.velocityY, bullet.velocityX) + Math.PI;
          for (let s = 0; s < 7; s++) {
            const angle = baseAngle + (Math.random() - 0.5) * 1.8;
            const sparkSpeed = 60 + Math.random() * 120;
            state.effects.push({
              id: crypto.randomUUID(),
              type: "spark",
              worldX: bullet.worldX,
              worldY: bullet.worldY,
              ageTicks: 0,
              durationTicks: 5,
              velocityX: Math.cos(angle) * sparkSpeed,
              velocityY: Math.sin(angle) * sparkSpeed,
            });
          }
          this.removeStateEntity(state, bullet);
        }
        stop = true;
        return;
      }

      // Hit actor
      const targetEntity = this.getEntityFromBody(
        entityMap,
        other as Circle | Box,
      );
      if (
        targetEntity &&
        (targetEntity.kind === EntityKind.MONSTER ||
          targetEntity.kind === EntityKind.PLAYER) &&
        (targetEntity as any).hp > 0 &&
        (targetEntity.id !== bullet.ownerId ||
          bullet.ownerGraceSeconds <= 0 ||
          bullet.ricochetCount > 0)
      ) {
        if (bullet.thrownItem) {
          this.resolveThrownActorHit(state, bullet, targetEntity);
        } else {
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
          this.removeStateEntity(state, bullet);
        }
        stop = true;
      }
    });

    return stop;
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
   * Reflect a thrown item's velocity off a wall and nudge it clear, losing a
   * little energy each bounce. No wall damage.
   */
  private bounceThrownItem(bullet: BulletEntity, response: Response): void {
    const normal = this.normalFromWallImpact(response);
    if (!normal) {
      bullet.velocityX = 0;
      bullet.velocityY = 0;
      return;
    }
    const dot = bullet.velocityX * normal.x + bullet.velocityY * normal.y;
    bullet.velocityX =
      (bullet.velocityX - 2 * dot * normal.x) * THROWN_BOUNCE_DAMP;
    bullet.velocityY =
      (bullet.velocityY - 2 * dot * normal.y) * THROWN_BOUNCE_DAMP;
    // Push out of the wall so it doesn't re-trigger the same collision.
    bullet.worldX += normal.x * (BULLET_RADIUS + 1);
    bullet.worldY += normal.y * (BULLET_RADIUS + 1);
    bullet.physicsBody?.setPosition(bullet.worldX, bullet.worldY);
    bullet.facingAngle = Math.atan2(bullet.velocityY, bullet.velocityX);
  }

  /**
   * A thrown bone/rock hit a creature. A bone may befriend a wild dog (no
   * damage, consumed); otherwise it deals light damage and drops to the floor.
   */
  private resolveThrownActorHit(
    state: GameState,
    bullet: BulletEntity,
    target: GameEntity,
  ): void {
    const monster = target as Monster;
    const isBone = bullet.thrownItem === ItemType.BONE;
    const isWildDog =
      target.kind === EntityKind.MONSTER &&
      monster.type === MonsterType.WILD_DOG;

    if (isBone && isWildDog && !monster.friendly) {
      if (RNG.chance(0.6)) {
        monster.friendly = true;
        monster.ownerId = bullet.ownerId;
        monster.alertLevel = 0;
        monster.name = monster.name ?? "Dog";
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: {
            type: "MESSAGE",
            message:
              "The wild dog gobbles the bone and wags its tail — a new friend!",
          },
        });
        // Ask the client to name the new pet.
        state.pendingDogNaming = monster.id;
        // The dog eats the bone — nothing to drop.
        this.removeStateEntity(state, bullet);
        return;
      }
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: {
          type: "MESSAGE",
          message: "The wild dog sniffs the bone but stays wary.",
        },
      });
      this.dropThrownItem(state, bullet);
      return;
    }

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: target.id,
        amount: bullet.damage,
        sourceId: bullet.ownerId,
        suppressHitSound: true,
        knockbackX: bullet.velocityX,
        knockbackY: bullet.velocityY,
        knockbackDistance: 6,
      },
    });
    this.dropThrownItem(state, bullet);
  }

  /**
   * Convert a thrown item that has come to rest (or struck something) back into
   * a pickable item on the floor at its current position.
   */
  private dropThrownItem(state: GameState, bullet: BulletEntity): void {
    if (bullet.thrownItem) {
      const item = new ItemEntity(
        bullet.gridX,
        bullet.gridY,
        bullet.thrownItem,
      );
      item.worldX = bullet.worldX;
      item.worldY = bullet.worldY;
      item.prevWorldX = bullet.worldX;
      item.prevWorldY = bullet.worldY;
      state.entityManager.spawn(item);
    }
    this.removeStateEntity(state, bullet);
  }

  /**
   * Remove an entity from both state and the collision system.
   */
  private removeStateEntity(state: GameState, entity: GameEntity): void {
    this.removeEntity(entity);
    state.entityManager.destroy(entity.id);
  }

  /**
   * Update explosives - move, check collisions with monsters and walls
   */
  public updateExplosives(state: GameState, dt: number): void {
    const entityMap = new Map<string, GameEntity>();
    const explosives: ExplosiveEntity[] = [];
    for (const e of state.entities) {
      if (e instanceof GameEntity) entityMap.set(e.id, e);
      if (e.kind === EntityKind.EXPLOSIVE && e instanceof ExplosiveEntity)
        explosives.push(e);
    }

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
            entityMap,
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
    width: number = MAP_WIDTH,
    height: number = MAP_HEIGHT,
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
      const tile = tileAtFor(map, x, y, width, height);
      if (TILE_DEFINITIONS[tile]?.opaque) {
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
