/**
 * Mouse input tracking for combat and interaction.
 *
 * With windowed rendering the canvas shows a window of the world whose top-left
 * sits at the camera origin (world px). So canvas → world is simply:
 *   world = camera_top_left + canvas_pixel / zoom
 * The camera moves every frame, so world coordinates are derived live from the
 * stored canvas position rather than cached at mousemove time.
 *
 * On the toroidal outside world the camera (and therefore the mouse world
 * position) lives in an unwrapped coordinate window that can sit far from the
 * player's wrapped `worldX/worldY` near a seam. Aiming/distance therefore use
 * wrapped deltas so they point the short way across the seam.
 */
import { wrapDelta } from "../../engine/utils/wrap";

export class MouseTracker {
  private canvasElement: HTMLCanvasElement;
  private mouseCanvasX: number = 0;
  private mouseCanvasY: number = 0;
  private scale: number = 2.0; // Renderer zoom factor
  private cameraLeft: number = 0; // Camera window top-left in world px
  private cameraTop: number = 0;
  private wraps: boolean = false; // toroidal level? (outside world)
  private worldWidth: number = 0; // world span in px (for wrapped deltas)
  private worldHeight: number = 0;

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
    const { x, y } = this.canvasPointFromClient(event.clientX, event.clientY);
    this.mouseCanvasX = x;
    this.mouseCanvasY = y;
  };

  /** Convert a viewport (client) point to canvas-buffer pixels. */
  private canvasPointFromClient(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = this.canvasElement.getBoundingClientRect();
    // The canvas buffer can be a different size than its CSS box; scale to match.
    const pixelScaleX =
      rect.width > 0 ? this.canvasElement.width / rect.width : 1;
    const pixelScaleY =
      rect.height > 0 ? this.canvasElement.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * pixelScaleX,
      y: (clientY - rect.top) * pixelScaleY,
    };
  }

  /**
   * Convert a viewport (client) point — e.g. from a click/contextmenu event — to
   * world coordinates using the live camera. Used by click-to-move so it lands
   * on the tile actually under the cursor.
   */
  public worldFromClientPoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const canvas = this.canvasPointFromClient(clientX, clientY);
    return {
      x: this.cameraLeft + canvas.x / this.scale,
      y: this.cameraTop + canvas.y / this.scale,
    };
  }

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

  /** Signed delta from a world coordinate to the mouse, the short way on a torus. */
  private deltaToMouse(
    worldX: number,
    worldY: number,
  ): { x: number; y: number } {
    const mouse = this.getWorldPosition();
    if (this.wraps) {
      return {
        x: wrapDelta(worldX, mouse.x, this.worldWidth),
        y: wrapDelta(worldY, mouse.y, this.worldHeight),
      };
    }
    return { x: mouse.x - worldX, y: mouse.y - worldY };
  }

  /**
   * Calculate angle from a point to the mouse cursor
   */
  public getAngleFrom(worldX: number, worldY: number): number {
    const d = this.deltaToMouse(worldX, worldY);
    return Math.atan2(d.y, d.x);
  }

  /**
   * Calculate distance from a point to the mouse cursor
   */
  public getDistanceFrom(worldX: number, worldY: number): number {
    const d = this.deltaToMouse(worldX, worldY);
    return Math.sqrt(d.x * d.x + d.y * d.y);
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
   * Tell the tracker whether the current level wraps (toroidal outside world)
   * and its world span in px, so aiming/distance use wrapped deltas near a seam.
   */
  public setWorldWrap(
    wraps: boolean,
    worldWidth: number,
    worldHeight: number,
  ): void {
    this.wraps = wraps;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  /**
   * Cleanup event listeners
   */
  public destroy(): void {
    this.canvasElement.removeEventListener("mousemove", this.handleMouseMove);
    this.canvasElement.removeEventListener("mouseleave", this.handleMouseLeave);
  }
}
