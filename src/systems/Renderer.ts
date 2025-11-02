import {
  GameState,
  TILE_DEFINITIONS,
  EntityKind,
  MAP_WIDTH,
  MAP_HEIGHT,
  CELL_CONFIG,
} from "../types";
import { idx } from "../utils/helpers";

/**
 * Handles rendering the game to canvas
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    this.ctx = ctx;

    // Set canvas size to fit the map
    this.canvas.width = MAP_WIDTH * CELL_CONFIG.w + CELL_CONFIG.padX * 2;
    this.canvas.height = MAP_HEIGHT * CELL_CONFIG.h + CELL_CONFIG.padY * 2;
  }

  /**
   * Render the entire game state
   */
  public render(state: GameState, isDead: boolean = false): void {
    const { ctx } = this;
    const { map, visible, explored, entities, player, options } = state;

    // Clear canvas
    ctx.fillStyle = "#0b0e12";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Calculate offsets to center the map
    const offsetX = CELL_CONFIG.padX;
    const offsetY = CELL_CONFIG.padY;

    // Setup font for characters
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Render tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileIndex = idx(x, y);
        const tile = TILE_DEFINITIONS[map[tileIndex]];
        const isVisible = options.fov ? visible.has(tileIndex) : true;
        const isExplored = explored.has(tileIndex);

        if (!isExplored) continue;

        const screenX = offsetX + x * CELL_CONFIG.w;
        const screenY = offsetY + y * CELL_CONFIG.h;

        // Draw background
        ctx.fillStyle = isVisible ? tile.bg : tile.bg;
        ctx.fillRect(screenX, screenY, CELL_CONFIG.w, CELL_CONFIG.h);

        // Draw tile character
        if (tile) {
          const color = isVisible
            ? tile.color
            : this.shadeColor(tile.color, 0.45);
          this.drawChar(tile.ch, screenX, screenY, color);
        }
      }
    }

    // Render entities (items first, then monsters)
    const sortedEntities = [...entities].sort((a, b) => {
      const aIsItem = a.kind === EntityKind.ITEM ? 1 : 0;
      const bIsItem = b.kind === EntityKind.ITEM ? 1 : 0;
      return aIsItem - bIsItem;
    });

    for (const entity of sortedEntities) {
      const tileIndex = idx(entity.x, entity.y);
      if (options.fov && !visible.has(tileIndex)) continue;

      const screenX = offsetX + entity.x * CELL_CONFIG.w;
      const screenY = offsetY + entity.y * CELL_CONFIG.h;
      this.drawChar(entity.ch, screenX, screenY, entity.color);
    }

    // Render player last
    const playerX = offsetX + player.x * CELL_CONFIG.w;
    const playerY = offsetY + player.y * CELL_CONFIG.h;
    const playerColor = isDead ? "#555" : "#e6edf3";
    this.drawChar("@", playerX, playerY, playerColor);
  }

  /**
   * Draw a character at screen position
   */
  private drawChar(char: string, x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillText(char, x + CELL_CONFIG.w / 2, y + CELL_CONFIG.h / 2);
  }

  /**
   * Shade a color towards black
   */
  private shadeColor(hex: string, factor: number): string {
    const color = parseInt(hex.replace("#", ""), 16);
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;

    const rr = Math.floor(r * factor);
    const gg = Math.floor(g * factor);
    const bb = Math.floor(b * factor);

    return `rgb(${rr},${gg},${bb})`;
  }
}
