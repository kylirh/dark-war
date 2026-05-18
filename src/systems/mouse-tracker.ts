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
  private cameraWorldX: number = 0;
  private cameraWorldY: number = 0;
  private scale: number = 2.0; // Renderer scale factor

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

    // Convert to world coordinates
    // The Pixi stage is scaled, so divide by scale to get unscaled canvas coordinates
    // Then subtract padding to get world coordinates
    const canvasUnscaledX = this.mouseCanvasX / this.scale;
    const canvasUnscaledY = this.mouseCanvasY / this.scale;

    // Convert to world coordinates by removing padding
    this.mouseWorldX = canvasUnscaledX - CELL_CONFIG.padX;
    this.mouseWorldY = canvasUnscaledY - CELL_CONFIG.padY;
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
   * Update camera position for accurate world coordinate conversion
   */
  public setCameraPosition(worldX: number, worldY: number): void {
    this.cameraWorldX = worldX;
    this.cameraWorldY = worldY;
  }

  /**
   * Set the scale factor from the renderer
   */
  public setScale(scale: number): void {
    this.scale = scale;
  }

  /**
   * Cleanup event listeners
   */
  public destroy(): void {
    this.canvasElement.removeEventListener("mousemove", this.handleMouseMove);
    this.canvasElement.removeEventListener("mouseleave", this.handleMouseLeave);
  }
}
