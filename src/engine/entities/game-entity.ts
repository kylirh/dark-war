import { EntityKind, CELL_CONFIG } from "../types";
import { Body } from "detect-collisions";

/**
 * Base class for all game entities with physics and continuous movement
 */
export abstract class GameEntity {
  /** Facing direction in radians (0 = right, PI/2 = down, PI = left, 3PI/2 = up) */
  public facingAngle: number = 0;

  /** Read-only grid X coordinate derived from worldX */
  public get gridX(): number {
    return Math.floor(this.worldX / CELL_CONFIG.w);
  }

  /** Read-only grid Y coordinate derived from worldY */
  public get gridY(): number {
    return Math.floor(this.worldY / CELL_CONFIG.h);
  }

  /** Unique identifier for the entity */
  public id: string;

  /** Kind of entity (e.g. PLAYER, MONSTER, ITEM) */
  public abstract kind: EntityKind;

  /** When this entity can act next (tick-based simulation timing) */
  public nextActTick?: number;

  /** Physics body reference (set and managed by the physics system) */
  public physicsBody?: Body;

  /** Previous world X coordinate in pixels for rendering interpolation between simulation ticks */
  public prevWorldX: number;

  /** Previous world Y coordinate in pixels for rendering interpolation between simulation ticks */
  public prevWorldY: number;

  /** Velocity in pixels per second along the X axis */
  public velocityX: number = 0;

  /** Velocity in pixels per second along the Y axis */
  public velocityY: number = 0;

  /** World X coordinate in pixels */
  public worldX: number;

  /** World Y coordinate in pixels */
  public worldY: number;

  constructor(gridX: number, gridY: number) {
    this.id = crypto.randomUUID();

    // Initialize world position to center of grid cell
    this.worldX = gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    this.worldY = gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    // Initialize previous position to current
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;
  }
}
