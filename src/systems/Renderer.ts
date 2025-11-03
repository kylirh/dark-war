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
  TILE_DEFINITIONS,
  EntityKind,
  ItemType,
  MAP_WIDTH,
  MAP_HEIGHT,
  CELL_CONFIG,
  TileType,
} from "../types";
import { idx } from "../utils/helpers";

// Sprite sheet tile coordinates
const SPRITE_MAP = {
  // Tiles
  [TileType.WALL]: { x: 0, y: 0 },
  [TileType.FLOOR]: { x: 1, y: 0 },
  [TileType.DOOR_CLOSED]: { x: 2, y: 0 },
  [TileType.DOOR_OPEN]: { x: 3, y: 0 },
  [TileType.DOOR_LOCKED]: { x: 4, y: 0 },
  [TileType.STAIRS]: { x: 5, y: 0 },

  // Player
  player: { x: 0, y: 1 },

  // Monsters
  mutant: { x: 0, y: 2 },

  // Items
  [ItemType.PISTOL]: { x: 0, y: 3 },
  [ItemType.AMMO]: { x: 1, y: 3 },
  [ItemType.MEDKIT]: { x: 2, y: 3 },
  [ItemType.KEYCARD]: { x: 3, y: 3 },
};

const SPRITE_SIZE = 16;

/**
 * Handles rendering the game using Pixi.js sprites
 */
export class Renderer {
  private app: Application;
  private mapContainer: Container;
  private entityContainer: Container;
  private spriteSheet?: Texture;
  private ready: boolean = false;

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

  private async initAsync(canvas: HTMLCanvasElement): Promise<void> {
    // Initialize Pixi application
    await this.app.init({
      canvas,
      width: MAP_WIDTH * CELL_CONFIG.w + CELL_CONFIG.padX * 2,
      height: MAP_HEIGHT * CELL_CONFIG.h + CELL_CONFIG.padY * 2,
      backgroundColor: 0x0b0e12,
    });

    // Load sprite sheet
    try {
      this.spriteSheet = await Assets.load("./assets/sprites.png");
      this.ready = true;
      console.log("✓ Sprites loaded");
    } catch (error) {
      console.error("Failed to load sprites:", error);
      // Fall back to colored rectangles if sprites fail to load
      this.ready = true;
    }

    // Add containers to stage
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.entityContainer);
  }

  /**
   * Get a sprite texture from the sprite sheet
   */
  private getTexture(spriteX: number, spriteY: number): Texture | null {
    if (!this.spriteSheet) return null;

    return new Texture({
      source: this.spriteSheet.source,
      frame: new Rectangle(
        spriteX * SPRITE_SIZE,
        spriteY * SPRITE_SIZE,
        SPRITE_SIZE,
        SPRITE_SIZE
      ),
    });
  }

  /**
   * Render the entire game state
   */
  public render(state: GameState, isDead: boolean = false): void {
    if (!this.ready) return;

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
        const tile = TILE_DEFINITIONS[map[tileIndex]];
        const isVisible = options.fov ? visible.has(tileIndex) : true;
        const isExplored = explored.has(tileIndex);

        if (!isExplored) continue;

        const screenX = offsetX + x * CELL_CONFIG.w;
        const screenY = offsetY + y * CELL_CONFIG.h;

        // Get sprite position for this tile type
        const spritePos = SPRITE_MAP[map[tileIndex]];
        if (spritePos) {
          const texture = this.getTexture(spritePos.x, spritePos.y);

          if (texture) {
            const sprite = new Sprite(texture);
            sprite.x = screenX;
            sprite.y = screenY;
            sprite.width = CELL_CONFIG.w;
            sprite.height = CELL_CONFIG.h;

            // Dim if not visible
            if (!isVisible) {
              sprite.alpha = 0.45;
            }

            this.mapContainer.addChild(sprite);
          } else {
            // Fallback: draw colored rectangle
            this.drawFallbackTile(screenX, screenY, tile.color, isVisible);
          }
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

      let spritePos;
      if (entity.kind === EntityKind.MONSTER) {
        spritePos = SPRITE_MAP.mutant;
      } else if (entity.kind === EntityKind.ITEM && "type" in entity) {
        spritePos = SPRITE_MAP[entity.type];
      }

      if (spritePos) {
        const texture = this.getTexture(spritePos.x, spritePos.y);
        if (texture) {
          const sprite = new Sprite(texture);
          sprite.x = screenX;
          sprite.y = screenY;
          sprite.width = CELL_CONFIG.w;
          sprite.height = CELL_CONFIG.h;
          this.entityContainer.addChild(sprite);
        }
      }
    }

    // Render player last
    const playerX = offsetX + player.x * CELL_CONFIG.w;
    const playerY = offsetY + player.y * CELL_CONFIG.h;
    const playerSpritePos = SPRITE_MAP.player;

    if (playerSpritePos) {
      const texture = this.getTexture(playerSpritePos.x, playerSpritePos.y);
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.x = playerX;
        sprite.y = playerY;
        sprite.width = CELL_CONFIG.w;
        sprite.height = CELL_CONFIG.h;

        if (isDead) {
          sprite.tint = 0x555555;
        }

        this.entityContainer.addChild(sprite);
      }
    }
  }

  /**
   * Fallback rendering for when sprites aren't available
   */
  private drawFallbackTile(
    x: number,
    y: number,
    color: string,
    isVisible: boolean
  ): void {
    // This would require Graphics object from Pixi
    // For now, we'll skip fallback - sprites should always work
  }
}
