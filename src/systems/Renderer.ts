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
  FLOOR_DAMAGE_THRESHOLDS,
  WALL_DAMAGE_THRESHOLDS,
} from "../types";
import { idx } from "../utils/helpers";
import {
  SPRITE_SIZE,
  SPRITE_COORDS,
  FLOOR_VARIANTS,
  EXPLOSION_FRAMES,
  PLAYER_WALK_FRAMES,
  PLAYER_IDLE_FRAMES,
  MONSTER_WALK_FRAMES,
  MONSTER_IDLE_FRAMES,
  FacingDirection,
} from "../config/sprites";

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
  private viewportElement?: HTMLElement;
  private scale: number = 2.0; // Configurable scale factor
  private cameraWorldX: number = 0; // Camera position for smooth following
  private cameraWorldY: number = 0;
  private playerFacing: FacingDirection = "down";

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }

    // Get the viewport element (parent with scrolling)
    this.viewportElement = canvas.parentElement || undefined;

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
    // Render at configured scale for fixed size display
    const canvasWidth =
      (MAP_WIDTH * CELL_CONFIG.w + CELL_CONFIG.padX * 2) * this.scale;
    const canvasHeight =
      (MAP_HEIGHT * CELL_CONFIG.h + CELL_CONFIG.padY * 2) * this.scale;

    // Initialize Pixi application
    await this.app.init({
      canvas,
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 0x4954aa,
      antialias: false, // Disable antialiasing for sharp pixels
      roundPixels: true, // Ensure pixel-perfect rendering
    });

    // Scale the stage to render at configured scale
    this.app.stage.scale.set(this.scale);

    // Load sprite sheet with direct image loading (faster than Assets.load)
    const img = new Image();
    img.src = "./assets/img/sprites.png";

    img.onload = () => {
      try {
        this.spriteSheet = Texture.from(img);
        // Set texture to use nearest neighbor (no smoothing)
        if (this.spriteSheet?.source) {
          this.spriteSheet.source.scaleMode = "nearest";
        }
        this.ready = true;

        // Render any pending state
        if (this.pendingRender) {
          this.render(this.pendingRender.state, this.pendingRender.isDead);
          this.pendingRender = undefined;
        }
      } catch (error) {
        console.error("Failed to create texture from sprite sheet:", error);
        this.ready = true; // Continue anyway
      }
    };

    img.onerror = (error) => {
      console.error("Failed to load sprite sheet:", error);
      this.ready = true; // Continue anyway
    };

    // Add containers to stage
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.entityContainer);
  }

  /**
   * Set the scale factor and update canvas size
   */
  public setScale(newScale: number): void {
    this.scale = newScale;

    // Update canvas size
    const canvasWidth =
      (MAP_WIDTH * CELL_CONFIG.w + CELL_CONFIG.padX * 2) * this.scale;
    const canvasHeight =
      (MAP_HEIGHT * CELL_CONFIG.h + CELL_CONFIG.padY * 2) * this.scale;

    this.app.renderer.resize(canvasWidth, canvasHeight);
    this.app.stage.scale.set(this.scale);
  }

  /**
   * Get current scale factor
   */
  public getScale(): number {
    return this.scale;
  }

  /**
   * Get current camera position in world coordinates
   */
  public getCameraPosition(): { x: number; y: number } {
    return { x: this.cameraWorldX, y: this.cameraWorldY };
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
        SPRITE_SIZE,
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
    screenY: number,
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

  private getNowMs(): number {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  private isEntityMoving(entity: {
    velocityX?: number;
    velocityY?: number;
    worldX?: number;
    worldY?: number;
    prevWorldX?: number;
    prevWorldY?: number;
  }): boolean {
    const velocityX = entity.velocityX ?? 0;
    const velocityY = entity.velocityY ?? 0;
    if (Math.abs(velocityX) > 0.05 || Math.abs(velocityY) > 0.05) {
      return true;
    }
    if (
      typeof entity.worldX === "number" &&
      typeof entity.worldY === "number" &&
      typeof entity.prevWorldX === "number" &&
      typeof entity.prevWorldY === "number"
    ) {
      const dx = entity.worldX - entity.prevWorldX;
      const dy = entity.worldY - entity.prevWorldY;
      return Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
    }
    return false;
  }

  private getEntityDirection(entity: {
    velocityX?: number;
    velocityY?: number;
    worldX?: number;
    worldY?: number;
    prevWorldX?: number;
    prevWorldY?: number;
  }): FacingDirection {
    const velocityX =
      typeof entity.velocityX === "number" ? entity.velocityX : 0;
    const velocityY =
      typeof entity.velocityY === "number" ? entity.velocityY : 0;
    if (Math.abs(velocityX) > 0.05 || Math.abs(velocityY) > 0.05) {
      if (Math.abs(velocityX) >= Math.abs(velocityY)) {
        return velocityX >= 0 ? "right" : "left";
      }
      return velocityY >= 0 ? "down" : "up";
    }
    if (
      typeof entity.worldX === "number" &&
      typeof entity.worldY === "number" &&
      typeof entity.prevWorldX === "number" &&
      typeof entity.prevWorldY === "number"
    ) {
      const dx = entity.worldX - entity.prevWorldX;
      const dy = entity.worldY - entity.prevWorldY;
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.05) {
        return dx >= 0 ? "right" : "left";
      }
      if (Math.abs(dy) > 0.05) {
        return dy >= 0 ? "down" : "up";
      }
    }
    return this.playerFacing;
  }

  private getWalkFrameIndex(
    nowMs: number,
    frameCount: number,
    speedMs: number,
    offsetMs: number = 0,
  ): number {
    if (frameCount <= 1) return 0;
    return Math.floor((nowMs + offsetMs) / speedMs) % frameCount;
  }

  /**
   * Render the entire game state with interpolation
   * @param state Game state
   * @param isDead Whether player is dead
   * @param alpha Interpolation factor (0.0 to 1.0) for smooth movement
   */
  public render(
    state: GameState,
    isDead: boolean = false,
    alpha: number = 0,
  ): void {
    if (!this.ready) {
      // Store state to render once ready
      this.pendingRender = { state, isDead };
      return;
    }

    const { map, visible, explored, entities, player, options, effects } =
      state;
    const nowMs = this.getNowMs();

    // Update camera position for smooth following (real-time mode only)
    if (state.sim.mode === "REALTIME" && "worldX" in player) {
      const targetX = (player as any).worldX;
      const targetY = (player as any).worldY;

      // Smooth camera interpolation (15% per frame)
      this.cameraWorldX += (targetX - this.cameraWorldX) * 0.15;
      this.cameraWorldY += (targetY - this.cameraWorldY) * 0.15;
    } else if ("worldX" in player) {
      // Planning mode: snap camera to player
      this.cameraWorldX = (player as any).worldX;
      this.cameraWorldY = (player as any).worldY;
    }

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
        const isExplored = options.fov ? explored.has(tileIndex) : true;

        if (!isExplored) continue;

        const screenX = offsetX + x * CELL_CONFIG.w;
        const screenY = offsetY + y * CELL_CONFIG.h;

        const tileType = map[tileIndex];
        const floorVariant = state.floorVariant ?? 0;
        const floorCoord =
          FLOOR_VARIANTS[floorVariant] || SPRITE_COORDS[TileType.FLOOR];
        const damage = state.wallDamage[tileIndex] || 0;

        let baseCoord: { x: number; y: number } | null = null;
        let overlayCoord: { x: number; y: number } | null = null;
        let tileCoord: { x: number; y: number } | null = null;

        if (tileType === TileType.FLOOR) {
          baseCoord = floorCoord;
          if (damage >= FLOOR_DAMAGE_THRESHOLDS[0]) {
            overlayCoord = SPRITE_COORDS.floor_damaged;
          }
        } else if (tileType === TileType.HOLE) {
          baseCoord = floorCoord;
          overlayCoord = SPRITE_COORDS.hole;
        }

        const needsFloorBase =
          tileType === TileType.DOOR_CLOSED ||
          tileType === TileType.DOOR_OPEN ||
          tileType === TileType.DOOR_LOCKED ||
          tileType === TileType.STAIRS_DOWN ||
          tileType === TileType.STAIRS_UP;

        if (needsFloorBase) {
          const floorVariant = state.floorVariant ?? 0;
          const floorCoord =
            FLOOR_VARIANTS[floorVariant] || SPRITE_COORDS[TileType.FLOOR];
          if (floorCoord) {
            const floorSprite = this.createSprite(
              floorCoord.x,
              floorCoord.y,
              screenX,
              screenY,
            );
            if (floorSprite) {
              if (!isVisible) {
                floorSprite.alpha = 0.45;
              }
              this.mapContainer.addChild(floorSprite);
            }
          }
          // Set tile coordinate for doors and stairs
          tileCoord = SPRITE_COORDS[tileType];
        } else if (tileType === TileType.WALL) {
          // Wall rendering with damage states
          const isWood = state.wallSet === "wood";
          const wallSpriteKey =
            damage >= WALL_DAMAGE_THRESHOLDS[1]
              ? isWood
                ? "wall_wood_damaged_2"
                : "wall_damaged_2"
              : damage >= WALL_DAMAGE_THRESHOLDS[0]
                ? isWood
                  ? "wall_wood_damaged_1"
                  : "wall_damaged_1"
                : isWood
                  ? "wall_wood"
                  : TileType.WALL;
          tileCoord = SPRITE_COORDS[wallSpriteKey] || SPRITE_COORDS[tileType];
        } else {
          // Default: use sprite coordinate for the tile type
          tileCoord = SPRITE_COORDS[tileType];
        }

        const renderSprite = (coord: { x: number; y: number }) => {
          const sprite = this.createSprite(coord.x, coord.y, screenX, screenY);
          if (sprite) {
            if (!isVisible) {
              sprite.alpha = 0.45;
            }
            this.mapContainer.addChild(sprite);
          }
        };

        if (baseCoord) {
          renderSprite(baseCoord);
        }
        if (overlayCoord) {
          renderSprite(overlayCoord);
        }
        if (tileCoord) {
          renderSprite(tileCoord);
        }
      }
    }

    // Render entities (items first, then monsters), excluding player
    const sortedEntities = entities
      .filter((e) => e.kind !== EntityKind.PLAYER)
      .sort((a, b) => {
        const aIsItem = a.kind === EntityKind.ITEM ? 1 : 0;
        const bIsItem = b.kind === EntityKind.ITEM ? 1 : 0;
        const aIsExplosive = a.kind === EntityKind.EXPLOSIVE ? 1 : 0;
        const bIsExplosive = b.kind === EntityKind.EXPLOSIVE ? 1 : 0;
        return bIsItem + bIsExplosive - (aIsItem + aIsExplosive);
      });

    for (const entity of sortedEntities) {
      // Type guard to ensure we have required properties
      if (!("gridX" in entity) || !("gridY" in entity)) continue;

      const tileIndex = idx(entity.gridX, entity.gridY);
      if (options.fov && !visible.has(tileIndex)) continue;

      // Use current world position (no interpolation for instant movement)
      let screenX: number, screenY: number;
      if ("worldX" in entity) {
        screenX = offsetX + (entity as any).worldX;
        screenY = offsetY + (entity as any).worldY;
      } else {
        // Fall back to grid-based positioning
        screenX =
          offsetX + (entity as any).x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
        screenY =
          offsetY + (entity as any).y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
      }

      let coord;

      if (entity.kind === EntityKind.MONSTER && "type" in entity) {
        const monsterType = entity.type as MonsterType;
        const moving = this.isEntityMoving(entity as any);
        if (moving && MONSTER_WALK_FRAMES[monsterType]) {
          const frames = MONSTER_WALK_FRAMES[monsterType];
          const frameIndex = this.getWalkFrameIndex(
            nowMs,
            frames.length,
            180,
            typeof entity.id === "number" ? entity.id * 37 : 0,
          );
          coord = frames[frameIndex];
        } else {
          coord =
            MONSTER_IDLE_FRAMES[monsterType] ?? SPRITE_COORDS[monsterType];
        }
      } else if (
        (entity.kind === EntityKind.ITEM ||
          entity.kind === EntityKind.EXPLOSIVE) &&
        "type" in entity
      ) {
        if (
          entity.kind === EntityKind.EXPLOSIVE &&
          entity.type === ItemType.LAND_MINE &&
          "armed" in entity &&
          entity.armed
        ) {
          coord = SPRITE_COORDS["land_mine_active"];
        } else {
          coord = SPRITE_COORDS[entity.type];
        }
      } else if (entity.kind === EntityKind.BULLET) {
        coord = SPRITE_COORDS["bullet"];
      }

      if (coord) {
        const sprite = this.createSprite(coord.x, coord.y, screenX, screenY);
        if (sprite) {
          // Center the sprite on its position
          sprite.anchor.set(0.5, 0.5);

          // Only rotate bullets, keep player and monsters upright
          if (entity.kind === EntityKind.BULLET && "facingAngle" in entity) {
            sprite.rotation = (entity as any).facingAngle;
          }
          this.entityContainer.addChild(sprite);
        }
      }
    }

    // Render effects (explosions) above entities
    for (const effect of effects) {
      const frameIndex = Math.min(
        EXPLOSION_FRAMES.length - 1,
        Math.floor(
          (effect.ageTicks / effect.durationTicks) * EXPLOSION_FRAMES.length,
        ),
      );
      const frame = EXPLOSION_FRAMES[frameIndex];
      const screenX = offsetX + effect.worldX;
      const screenY = offsetY + effect.worldY;
      const sprite = this.createSprite(frame.x, frame.y, screenX, screenY);
      if (sprite) {
        sprite.anchor.set(0.5, 0.5);
        this.entityContainer.addChild(sprite);
      }
    }

    // Render player last
    let playerX: number, playerY: number;
    if ("worldX" in player) {
      playerX = offsetX + (player as any).worldX;
      playerY = offsetY + (player as any).worldY;
    } else {
      playerX = offsetX + (player as any).x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
      playerY = offsetY + (player as any).y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    }
    const playerMoving = this.isEntityMoving(player as any);
    if (playerMoving) {
      this.playerFacing = this.getEntityDirection(player as any);
    }
    const playerFacing =
      this.playerFacing ?? this.getEntityDirection(player as any);

    const playerCoord = isDead
      ? SPRITE_COORDS["player_dead"]
      : playerMoving
        ? PLAYER_WALK_FRAMES[playerFacing][
            this.getWalkFrameIndex(
              nowMs,
              PLAYER_WALK_FRAMES[playerFacing].length,
              160,
            )
          ]
        : PLAYER_IDLE_FRAMES[playerFacing];

    if (playerCoord) {
      const sprite = this.createSprite(
        playerCoord.x,
        playerCoord.y,
        playerX,
        playerY,
      );

      if (sprite) {
        // Center the sprite on player position
        sprite.anchor.set(0.5, 0.5);

        // Player sprite stays upright (no rotation)
        if (!isDead && (playerFacing === "right" || playerFacing === "left")) {
          sprite.scale.x = playerFacing === "right" ? -1 : 1;
        }
        this.entityContainer.addChild(sprite);
      }
    }
  }

  /**
   * Center viewport on player position with smart scrolling
   */
  public centerOnPlayer(
    player: { gridX: number; gridY: number; worldX?: number; worldY?: number },
    smooth: boolean = true,
  ): void {
    if (!this.viewportElement) return;

    const offsetX = CELL_CONFIG.padX;
    const offsetY = CELL_CONFIG.padY;

    // Calculate player's screen position (at configured scale)
    const playerWorldX =
      typeof player.worldX === "number"
        ? player.worldX
        : player.gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const playerWorldY =
      typeof player.worldY === "number"
        ? player.worldY
        : player.gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    const playerScreenX = (offsetX + playerWorldX) * this.scale;
    const playerScreenY = (offsetY + playerWorldY) * this.scale;

    // Calculate scroll position to center player in viewport
    const targetScrollX = playerScreenX - this.viewportElement.clientWidth / 2;
    const targetScrollY = playerScreenY - this.viewportElement.clientHeight / 2;

    const currentScrollX = this.viewportElement.scrollLeft;
    const currentScrollY = this.viewportElement.scrollTop;

    if (smooth) {
      const nextScrollX =
        currentScrollX + (targetScrollX - currentScrollX) * 0.2;
      const nextScrollY =
        currentScrollY + (targetScrollY - currentScrollY) * 0.2;
      this.viewportElement.scrollLeft = nextScrollX;
      this.viewportElement.scrollTop = nextScrollY;
    } else {
      this.viewportElement.scrollLeft = targetScrollX;
      this.viewportElement.scrollTop = targetScrollY;
    }
  }
}
