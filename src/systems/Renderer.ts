import {
  Application,
  Container,
  Sprite,
  Texture,
  Assets,
  Rectangle,
} from "pixi.js";
import {
  GameState,
  EntityKind,
  ItemType,
  MAP_WIDTH,
  MAP_HEIGHT,
  CELL_CONFIG,
  TileType,
  MonsterType,
} from "../types";
import { idx } from "../utils/helpers";
import { SPRITE_SIZE, SPRITE_COORDS } from "../config/sprites";

/**
 * Handles rendering the game using Pixi.js
 */
export class Renderer {
  private app: Application;
  private mapContainer: Container;
  private entityContainer: Container;
  private spriteSheet?: Texture;
  private textureCache: Map<string, Texture> = new Map();
  private ready: boolean = false;
  private pendingRender?: { state: GameState; isDead: boolean };

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }

    // Create Pixi application
    this.app = new Application();

    // Initialize containers
    this.mapContainer = new Container();
    this.entityContainer = new Container();

    // Initialize app asynchronously
    this.initAsync(canvas);
  }

  /**
   * Initialize Pixi.js application and load sprite sheet
   */
  private async initAsync(canvas: HTMLCanvasElement): Promise<void> {
    // Initialize Pixi application
    await this.app.init({
      canvas,
      width: MAP_WIDTH * CELL_CONFIG.w + CELL_CONFIG.padX * 2,
      height: MAP_HEIGHT * CELL_CONFIG.h + CELL_CONFIG.padY * 2,
      backgroundColor: 0x4954aa,
    });

    // Load sprite sheet
    try {
      this.spriteSheet = await Assets.load("./assets/sprites.png");
      this.ready = true;
      console.log("✓ Sprites loaded");
    } catch (error) {
      console.error("Failed to load sprite sheet:", error);
      this.ready = true; // Continue anyway
    }

    // Add containers to stage
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.entityContainer);

    // Render any pending state
    if (this.pendingRender) {
      this.render(this.pendingRender.state, this.pendingRender.isDead);
      this.pendingRender = undefined;
    }
  }

  /**
   * Textures are cached to prevent memory leaks
   */
  private getTexture(x: number, y: number): Texture | null {
    if (!this.spriteSheet) return null;

    const key = `${x},${y}`;

    // Return cached texture if available
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!;
    }

    // Create new texture and cache it
    const texture = new Texture({
      source: this.spriteSheet.source,
      frame: new Rectangle(
        x * SPRITE_SIZE,
        y * SPRITE_SIZE,
        SPRITE_SIZE,
        SPRITE_SIZE
      ),
    });

    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Create a Pixi sprite from sprite sheet coordinates
   */
  private createSprite(
    x: number,
    y: number,
    screenX: number,
    screenY: number
  ): Sprite | null {
    const texture = this.getTexture(x, y);
    if (!texture) return null;

    const sprite = new Sprite(texture);
    sprite.x = screenX;
    sprite.y = screenY;
    sprite.width = CELL_CONFIG.w;
    sprite.height = CELL_CONFIG.h;

    return sprite;
  }

  /**
   * Render the entire game state
   */
  public render(state: GameState, isDead: boolean = false): void {
    if (!this.ready) {
      // Store state to render once ready
      this.pendingRender = { state, isDead };
      return;
    }

    const { map, visible, explored, entities, player, options } = state;

    // Clear previous frame
    this.mapContainer.removeChildren();
    this.entityContainer.removeChildren();

    const offsetX = CELL_CONFIG.padX;
    const offsetY = CELL_CONFIG.padY;

    // Render tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileIndex = idx(x, y);
        const isVisible = options.fov ? visible.has(tileIndex) : true;
        const isExplored = explored.has(tileIndex);

        if (!isExplored) continue;

        const screenX = offsetX + x * CELL_CONFIG.w;
        const screenY = offsetY + y * CELL_CONFIG.h;

        // Get sprite coordinates for this tile
        const tileType = map[tileIndex];
        const coord = SPRITE_COORDS[tileType];

        if (coord) {
          const sprite = this.createSprite(coord.x, coord.y, screenX, screenY);
          if (sprite) {
            // Dim unexplored tiles
            if (!isVisible) {
              sprite.alpha = 0.45;
            }
            this.mapContainer.addChild(sprite);
          }
        }
      }
    }

    // Render entities (items first, then monsters)
    const sortedEntities = [...entities].sort((a, b) => {
      const aIsItem = a.kind === EntityKind.ITEM ? 1 : 0;
      const bIsItem = b.kind === EntityKind.ITEM ? 1 : 0;
      return bIsItem - aIsItem;
    });

    for (const entity of sortedEntities) {
      const tileIndex = idx(entity.x, entity.y);
      if (options.fov && !visible.has(tileIndex)) continue;

      const screenX = offsetX + entity.x * CELL_CONFIG.w;
      const screenY = offsetY + entity.y * CELL_CONFIG.h;

      let coord;

      if (entity.kind === EntityKind.MONSTER && "type" in entity) {
        coord = SPRITE_COORDS[entity.type];
      } else if (entity.kind === EntityKind.ITEM && "type" in entity) {
        coord = SPRITE_COORDS[entity.type];
      }

      if (coord) {
        const sprite = this.createSprite(coord.x, coord.y, screenX, screenY);
        if (sprite) {
          this.entityContainer.addChild(sprite);
        }
      }
    }

    // Render player last
    const playerX = offsetX + player.x * CELL_CONFIG.w;
    const playerY = offsetY + player.y * CELL_CONFIG.h;
    const playerCoord = SPRITE_COORDS["player"];

    if (playerCoord) {
      const sprite = this.createSprite(
        playerCoord.x,
        playerCoord.y,
        playerX,
        playerY
      );

      if (sprite) {
        // Apply death effect
        if (isDead) {
          sprite.tint = 0x555555;
        }
        this.entityContainer.addChild(sprite);
      }
    }
  }
}
