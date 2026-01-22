/**
 * Mouse input tracking for combat and interaction
 */

import { CELL_CONFIG } from "../types";

export class MouseTracker {
  private canvasElement: HTMLCanvasElement;
  private mouseWorldX: number = 0;
  private mouseWorldY: number = 0;
  private mouseCanvasX: number = 0;
  private mouseCanvasY: number = 0;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    this.canvasElement = canvas;

    // Track mouse movement
    canvas.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mouseleave", this.handleMouseLeave);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const rect = this.canvasElement.getBoundingClientRect();
    
    // Get mouse position relative to canvas
    this.mouseCanvasX = event.clientX - rect.left;
    this.mouseCanvasY = event.clientY - rect.top;

    // Convert to world coordinates (accounting for scale and padding)
    // Canvas is scaled, so divide by scale to get actual position
    const scale = parseFloat(getComputedStyle(this.canvasElement).width) / this.canvasElement.width || 1;
    this.mouseWorldX = (this.mouseCanvasX / scale) - CELL_CONFIG.padX;
    this.mouseWorldY = (this.mouseCanvasY / scale) - CELL_CONFIG.padY;
  };

  private handleMouseLeave = (): void => {
    // Keep last known position
  };

  /**
   * Get mouse position in world coordinates
   */
  public getWorldPosition(): { x: number; y: number } {
    return { x: this.mouseWorldX, y: this.mouseWorldY };
  }

  /**
   * Get mouse position in canvas coordinates
   */
  public getCanvasPosition(): { x: number; y: number } {
    return { x: this.mouseCanvasX, y: this.mouseCanvasY };
  }

  /**
   * Calculate angle from a point to the mouse cursor
   */
  public getAngleFrom(worldX: number, worldY: number): number {
    const dx = this.mouseWorldX - worldX;
    const dy = this.mouseWorldY - worldY;
    return Math.atan2(dy, dx);
  }

  /**
   * Calculate distance from a point to the mouse cursor
   */
  public getDistanceFrom(worldX: number, worldY: number): number {
    const dx = this.mouseWorldX - worldX;
    const dy = this.mouseWorldY - worldY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Cleanup event listeners
   */
  public destroy(): void {
    this.canvasElement.removeEventListener("mousemove", this.handleMouseMove);
    this.canvasElement.removeEventListener("mouseleave", this.handleMouseLeave);
  }
}
