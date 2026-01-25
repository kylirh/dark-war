/**
 * ContinuousEntity - Base class for all moving entities
 *
 * Uses continuous pixel-based coordinates (worldX, worldY) as source of truth,
 * with grid coordinates (gridX, gridY) derived from them.
 *
 * Key concepts:
 * - worldX/worldY: Float coordinates in pixels (0,0 is top-left)
 * - gridX/gridY: Derived grid coordinates (READ-ONLY getters)
 * - velocityX/velocityY: Movement speed in pixels/second
 * - targetWorldX/targetWorldY: Destination for smooth movement
 * - physicsBody: Collision detection body (managed by Physics system)
 */

import { EntityKind, CELL_CONFIG } from "../types";
import { Body } from "detect-collisions";

/**
 * Base properties for all continuous entities
 */
export abstract class ContinuousEntity {
  public id: string;
  public abstract kind: EntityKind;

  // Source of Truth: World coordinates (float, in pixels)
  public worldX: number;
  public worldY: number;

  // Previous world position (for interpolation)
  public prevWorldX: number;
  public prevWorldY: number;

  // Velocity (pixels per second)
  public velocityX: number = 0;
  public velocityY: number = 0;

  // Facing direction (radians, 0 = right, PI/2 = down, PI = left, 3PI/2 = up)
  public facingAngle: number = 0;

  // Action timing
  public nextActTick?: number;

  // Physics body reference (set by Physics system)
  public physicsBody?: Body;

  constructor(gridX: number, gridY: number) {
    this.id = crypto.randomUUID();

    // Initialize world position to center of grid cell
    this.worldX = gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    this.worldY = gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    // Initialize previous position to current
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;
  }

  /**
   * Derived State: Grid X coordinate (read-only)
   * Calculated from worldX, never set manually
   */
  public get gridX(): number {
    return Math.floor(this.worldX / CELL_CONFIG.w);
  }

  /**
   * Derived State: Grid Y coordinate (read-only)
   * Calculated from worldY, never set manually
   */
  public get gridY(): number {
    return Math.floor(this.worldY / CELL_CONFIG.h);
  }

  /**
   * Legacy compatibility: x maps to gridX
   */
  public get x(): number {
    return this.gridX;
  }

  /**
   * Legacy compatibility: y maps to gridY
   */
  public get y(): number {
    return this.gridY;
  }

  /**
   * Store current position as previous (call before physics update)
   */
  public storePreviousPosition(): void {
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;
  }

  /**
   * Set world position from grid coordinates
   */
  public setPositionFromGrid(gridX: number, gridY: number): void {
    this.worldX = gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    this.worldY = gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    this.prevWorldX = this.worldX;
    this.prevWorldY = this.worldY;
  }
}
