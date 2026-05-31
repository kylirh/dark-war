/**
 * Mouse input tracking for combat and interaction.
 *
 * With windowed rendering the canvas shows a window of the world whose top-left
 * sits at the camera origin (world px). So canvas → world is simply:
 *   world = camera_top_left + canvas_pixel / zoom
 * The camera moves every frame, so world coordinates are derived live from the
 * stored canvas position rather than cached at mousemove time.
 */

export class MouseTracker {
  private canvasElement: HTMLCanvasElement;
  private mouseCanvasX: number = 0;
  private mouseCanvasY: number = 0;
  private scale: number = 2.0; // Renderer zoom factor
  private cameraLeft: number = 0; // Camera window top-left in world px
  private cameraTop: number = 0;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    this.canvasElement = canvas;

    canvas.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mouseleave", this.handleMouseLeave);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const rect = this.canvasElement.getBoundingClientRect();
    // Canvas pixels can be a different size than the CSS box; scale accordingly.
    const pixelScaleX =
      rect.width > 0 ? this.canvasElement.width / rect.width : 1;
    const pixelScaleY =
      rect.height > 0 ? this.canvasElement.height / rect.height : 1;
    this.mouseCanvasX = (event.clientX - rect.left) * pixelScaleX;
    this.mouseCanvasY = (event.clientY - rect.top) * pixelScaleY;
  };

  private handleMouseLeave = (): void => {
    // Keep last known position
  };

  /**
   * Get mouse position in world coordinates (derived from the live camera).
   */
  public getWorldPosition(): { x: number; y: number } {
    return {
      x: this.cameraLeft + this.mouseCanvasX / this.scale,
      y: this.cameraTop + this.mouseCanvasY / this.scale,
    };
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
    const mouse = this.getWorldPosition();
    return Math.atan2(mouse.y - worldY, mouse.x - worldX);
  }

  /**
   * Calculate distance from a point to the mouse cursor
   */
  public getDistanceFrom(worldX: number, worldY: number): number {
    const mouse = this.getWorldPosition();
    const dx = mouse.x - worldX;
    const dy = mouse.y - worldY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Set the zoom factor from the renderer
   */
  public setScale(scale: number): void {
    this.scale = scale;
  }

  /**
   * Update the camera window's top-left (world px) so canvas → world stays
   * accurate as the camera follows the player.
   */
  public setCameraTopLeft(worldX: number, worldY: number): void {
    this.cameraLeft = worldX;
    this.cameraTop = worldY;
  }

  /**
   * Cleanup event listeners
   */
  public destroy(): void {
    this.canvasElement.removeEventListener("mousemove", this.handleMouseMove);
    this.canvasElement.removeEventListener("mouseleave", this.handleMouseLeave);
  }
}
