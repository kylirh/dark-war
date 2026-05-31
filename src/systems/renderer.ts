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
  private readonly canvas: HTMLCanvasElement;
  private mapContainer: Container;
  private entityContainer: Container;
  private spriteSheet?: Texture;
  private spriteSheetImage?: HTMLImageElement;
  private textureCache: Map<string, Texture> = new Map();
  private ready: boolean = false;
  private pendingRender?: { state: GameState; isDead: boolean };
  private viewportElement?: HTMLElement;
  private scale: number = 1.0; // Configurable scale factor
  private cameraWorldX: number = 0; // Camera position for smooth following
  private cameraWorldY: number = 0;
  private playerFacing: FacingDirection = "down";
  private shakeIntensity: number = 0;
  private canvasMapWidth: number = MAP_WIDTH;
  private canvasMapHeight: number = MAP_HEIGHT;

  constructor(canvasId: string, initialScale: number = 1.0) {
    this.scale = initialScale;
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    this.canvas = canvas;

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
      (this.canvasMapWidth * CELL_CONFIG.w + CELL_CONFIG.padX * 2) *
      this.scale;
    const canvasHeight =
      (this.canvasMapHeight * CELL_CONFIG.h + CELL_CONFIG.padY * 2) *
      this.scale;

    // Initialize Pixi application
    await this.app.init({
      canvas,
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 0x4954aa,
      antialias: false, // Disable antialiasing for sharp pixels
      roundPixels: true, // Ensure pixel-perfect rendering
      preserveDrawingBuffer: true, // Allows reliable save-slot screenshots.
    });

    // Scale the stage to render at configured scale
    this.app.stage.scale.set(this.scale);

    // Add containers to stage
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.entityContainer);

    const spriteSheetUrl = "./assets/img/sprites.png?v=outside-level-0";
    try {
      this.spriteSheet = await Assets.load<Texture>(spriteSheetUrl);
      if (this.spriteSheet?.source) {
        this.spriteSheet.source.scaleMode = "nearest";
      }
      this.spriteSheetImage = await this.loadSpriteSheetImage(spriteSheetUrl);
    } catch (error) {
      console.error("Failed to load sprite sheet:", error);
    } finally {
      this.ready = true;

      if (this.pendingRender) {
        this.render(this.pendingRender.state, this.pendingRender.isDead);
        this.pendingRender = undefined;
      }
    }
  }

  private loadSpriteSheetImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${src}`));
      image.src = src;
    });
  }

  /**
   * Set the scale factor and update canvas size
   */
  public setScale(newScale: number): void {
    this.scale = newScale;

    // Update canvas size
    const canvasWidth =
      (this.canvasMapWidth * CELL_CONFIG.w + CELL_CONFIG.padX * 2) *
      this.scale;
    const canvasHeight =
      (this.canvasMapHeight * CELL_CONFIG.h + CELL_CONFIG.padY * 2) *
      this.scale;

    this.app.renderer.resize(canvasWidth, canvasHeight);
    this.app.stage.scale.set(this.scale);
  }

  private syncCanvasSize(state: GameState): void {
    if (
      state.mapWidth === this.canvasMapWidth &&
      state.mapHeight === this.canvasMapHeight
    ) {
      return;
    }

    this.canvasMapWidth = state.mapWidth;
    this.canvasMapHeight = state.mapHeight;
    this.setScale(this.scale);
  }

  /**
   * Get current scale factor
   */
  public getScale(): number {
    return this.scale;
  }

  /**
   * Capture a cropped bitmap around the local player for save slot previews.
   */
  public async capturePlayerSnapshot(
    state: GameState,
    radiusTiles: number = 4,
  ): Promise<string | null> {
    if (!this.ready || !this.canvas) return null;

    const player = state.player;
    const playerWorldX =
      typeof player.worldX === "number"
        ? player.worldX
        : player.gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const playerWorldY =
      typeof player.worldY === "number"
        ? player.worldY
        : player.gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    const radiusPx = radiusTiles * CELL_CONFIG.w;
    const cropSize = (radiusTiles * 2 + 1) * CELL_CONFIG.w * this.scale;
    const cropX = (CELL_CONFIG.padX + playerWorldX - radiusPx) * this.scale;
    const cropY = (CELL_CONFIG.padY + playerWorldY - radiusPx) * this.scale;

    const sourceX = Math.max(0, Math.min(cropX, this.canvas.width - cropSize));
    const sourceY = Math.max(0, Math.min(cropY, this.canvas.height - cropSize));
    const sourceWidth = Math.min(cropSize, this.canvas.width - sourceX);
    const sourceHeight = Math.min(cropSize, this.canvas.height - sourceY);

    if (sourceWidth <= 0 || sourceHeight <= 0) return null;

    const renderedPreview = this.capturePlayerSnapshotFromSprites(
      state,
      radiusTiles,
    );
    if (renderedPreview) return renderedPreview;

    const copied = this.capturePlayerSnapshotFromCanvas(
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    );
    if (copied) return copied;

    return this.capturePlayerSnapshotFromRenderer(
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    );
  }

  private capturePlayerSnapshotFromRenderer(
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ): string | null {
    try {
      const extractedCanvas = this.app.renderer.extract.canvas({
        target: this.app.stage,
        frame: new Rectangle(sourceX, sourceY, sourceWidth, sourceHeight),
        resolution: 1,
        clearColor: 0x05070a,
      });
      return this.canvasToPreviewDataUrl(extractedCanvas as HTMLCanvasElement);
    } catch {
      return null;
    }
  }

  private capturePlayerSnapshotFromCanvas(
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ): string | null {
    try {
      return this.canvasToPreviewDataUrl(
        this.canvas,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
      );
    } catch {
      return null;
    }
  }

  private canvasToPreviewDataUrl(
    sourceCanvas: HTMLCanvasElement,
    sourceX: number = 0,
    sourceY: number = 0,
    sourceWidth: number = sourceCanvas.width,
    sourceHeight: number = sourceCanvas.height,
  ): string | null {
    const preview = document.createElement("canvas");
    preview.width = 320;
    preview.height = 320;
    const context = preview.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#05070a";
    context.fillRect(0, 0, preview.width, preview.height);
    context.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      preview.width,
      preview.height,
    );
    return preview.toDataURL("image/png");
  }

  private capturePlayerSnapshotFromSprites(
    state: GameState,
    radiusTiles: number,
  ): string | null {
    if (!this.spriteSheetImage) return null;

    const tileCount = radiusTiles * 2 + 1;
    const sourceSize = tileCount * CELL_CONFIG.w;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = sourceSize;
    sourceCanvas.height = sourceSize;
    const context = sourceCanvas.getContext("2d");
    if (!context) return null;

    context.imageSmoothingEnabled = false;
    context.fillStyle = "#05070a";
    context.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

    const player = state.player;
    const minGridX = player.gridX - radiusTiles;
    const minGridY = player.gridY - radiusTiles;
    const usingShadowFov = state.options.fov;

    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        const mapX = minGridX + x;
        const mapY = minGridY + y;
        if (
          mapX < 0 ||
          mapY < 0 ||
          mapX >= state.mapWidth ||
          mapY >= state.mapHeight
        ) {
          continue;
        }

        const tileIndex = mapX + mapY * state.mapWidth;
        const isRevealed = usingShadowFov ? state.explored.has(tileIndex) : true;
        if (!isRevealed) continue;

        const isVisible = usingShadowFov
          ? state.enhancedVision
            ? state.explored.has(tileIndex)
            : state.visible.has(tileIndex)
          : true;
        const alpha = !isVisible && usingShadowFov ? 0.45 : 1;
        const tileType = state.tiles.getTile(mapX, mapY);
        const screenX = x * CELL_CONFIG.w;
        const screenY = y * CELL_CONFIG.h;

        this.drawTilePreviewSprites(
          context,
          tileType,
          state,
          tileIndex,
          screenX,
          screenY,
          alpha,
        );
      }
    }

    const sortedEntities = state.entities
      .filter((entity) => entity.kind !== EntityKind.PLAYER || entity.id !== player.id)
      .sort((a, b) => {
        const aIsItem = a.kind === EntityKind.ITEM ? 1 : 0;
        const bIsItem = b.kind === EntityKind.ITEM ? 1 : 0;
        const aIsExplosive = a.kind === EntityKind.EXPLOSIVE ? 1 : 0;
        const bIsExplosive = b.kind === EntityKind.EXPLOSIVE ? 1 : 0;
        return bIsItem + bIsExplosive - (aIsItem + aIsExplosive);
      });

    for (const entity of sortedEntities) {
      if (
        entity.gridX < minGridX ||
        entity.gridY < minGridY ||
        entity.gridX >= minGridX + tileCount ||
        entity.gridY >= minGridY + tileCount
      ) {
        continue;
      }
      const tileIndex = entity.gridX + entity.gridY * state.mapWidth;
      const shouldRenderEntity = usingShadowFov
        ? state.enhancedVision
          ? state.explored.has(tileIndex)
          : state.visible.has(tileIndex)
        : true;
      if (!shouldRenderEntity) continue;

      const coord = this.getPreviewEntitySpriteCoord(entity);
      if (!coord) continue;
      this.drawPreviewSprite(
        context,
        coord,
        entity.worldX - minGridX * CELL_CONFIG.w - CELL_CONFIG.w / 2,
        entity.worldY - minGridY * CELL_CONFIG.h - CELL_CONFIG.h / 2,
      );
    }

    const playerCoord =
      player.hp <= 0
        ? SPRITE_COORDS["player_dead"]
        : PLAYER_IDLE_FRAMES[this.playerFacing];
    this.drawPreviewSprite(
      context,
      playerCoord,
      player.worldX - minGridX * CELL_CONFIG.w - CELL_CONFIG.w / 2,
      player.worldY - minGridY * CELL_CONFIG.h - CELL_CONFIG.h / 2,
    );

    return this.canvasToPreviewDataUrl(sourceCanvas);
  }

  private drawTilePreviewSprites(
    context: CanvasRenderingContext2D,
    tileType: TileType,
    state: GameState,
    tileIndex: number,
    screenX: number,
    screenY: number,
    alpha: number,
  ): void {
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
      this.drawPreviewSprite(context, floorCoord, screenX, screenY, alpha);
      tileCoord =
        state.levelKind === "outside" && tileType === TileType.STAIRS_DOWN
          ? SPRITE_COORDS.megacorp_entrance
          : SPRITE_COORDS[tileType];
    } else if (tileType === TileType.WALL) {
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
    } else if (tileType !== TileType.FLOOR && tileType !== TileType.HOLE) {
      tileCoord = SPRITE_COORDS[tileType];
    }

    if (baseCoord) this.drawPreviewSprite(context, baseCoord, screenX, screenY, alpha);
    if (overlayCoord) this.drawPreviewSprite(context, overlayCoord, screenX, screenY, alpha);
    if (tileCoord) this.drawPreviewSprite(context, tileCoord, screenX, screenY, alpha);
  }

  private getPreviewEntitySpriteCoord(entity: GameState["entities"][number]): {
    x: number;
    y: number;
  } | null {
    if (entity.kind === EntityKind.MONSTER) {
      return MONSTER_IDLE_FRAMES[entity.type] ?? SPRITE_COORDS[entity.type];
    }
    if (entity.kind === EntityKind.ITEM) {
      return SPRITE_COORDS[entity.type] ?? null;
    }
    if (entity.kind === EntityKind.EXPLOSIVE) {
      if (entity.type === ItemType.LAND_MINE && entity.armed) {
        return SPRITE_COORDS.land_mine_active;
      }
      return SPRITE_COORDS[entity.type] ?? null;
    }
    if (entity.kind === EntityKind.BULLET) {
      return SPRITE_COORDS.bullet;
    }
    if (entity.kind === EntityKind.PLAYER) {
      return entity.hp <= 0
        ? SPRITE_COORDS.player_dead
        : PLAYER_IDLE_FRAMES[this.playerFacing];
    }
    return null;
  }

  private drawPreviewSprite(
    context: CanvasRenderingContext2D,
    coord: { x: number; y: number },
    screenX: number,
    screenY: number,
    alpha: number = 1,
  ): void {
    if (!this.spriteSheetImage) return;
    context.save();
    context.globalAlpha = alpha;
    context.drawImage(
      this.spriteSheetImage,
      coord.x * SPRITE_SIZE,
      coord.y * SPRITE_SIZE,
      SPRITE_SIZE,
      SPRITE_SIZE,
      Math.round(screenX),
      Math.round(screenY),
      CELL_CONFIG.w,
      CELL_CONFIG.h,
    );
    context.restore();
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

    this.syncCanvasSize(state);

    const {
      visible,
      explored,
      enhancedVision,
      entities,
      player,
      options,
      effects,
    } = state;
    const nowMs = this.getNowMs();
    const usingShadowFov = options.fov;

    // Screen shake — triggered by new explosion effects (ageTicks=0 = fresh this sim tick)
    const hasNewExplosion = effects.some(
      (e) => e.type === "explosion" && e.ageTicks === 0,
    );
    if (hasNewExplosion) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 6);
    }
    this.shakeIntensity *= 0.86;
    if (this.shakeIntensity < 0.3) this.shakeIntensity = 0;
    this.app.stage.x =
      this.shakeIntensity > 0
        ? (Math.random() - 0.5) * this.shakeIntensity * this.scale
        : 0;
    this.app.stage.y =
      this.shakeIntensity > 0
        ? (Math.random() - 0.5) * this.shakeIntensity * this.scale
        : 0;

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
    for (let y = 0; y < state.mapHeight; y++) {
      for (let x = 0; x < state.mapWidth; x++) {
        const tileIndex = x + y * state.mapWidth;
        const isRevealed = usingShadowFov ? explored.has(tileIndex) : true;
        const isVisible = usingShadowFov
          ? enhancedVision
            ? explored.has(tileIndex)
            : visible.has(tileIndex)
          : true;
        const tileType = state.tiles.getTile(x, y);

        if (!isRevealed) continue;

        const screenX = offsetX + x * CELL_CONFIG.w;
        const screenY = offsetY + y * CELL_CONFIG.h;

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
              if (!isVisible && usingShadowFov) {
                floorSprite.alpha = 0.45;
              }
              this.mapContainer.addChild(floorSprite);
            }
          }
          // Set tile coordinate for doors and stairs
          tileCoord =
            state.levelKind === "outside" && tileType === TileType.STAIRS_DOWN
              ? SPRITE_COORDS.megacorp_entrance
              : SPRITE_COORDS[tileType];
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
        } else if (tileType !== TileType.FLOOR && tileType !== TileType.HOLE) {
          // Default: use sprite coordinate for the tile type
          // (FLOOR and HOLE already handled via baseCoord/overlayCoord)
          tileCoord = SPRITE_COORDS[tileType];
        }

        const renderSprite = (coord: { x: number; y: number }) => {
          const sprite = this.createSprite(coord.x, coord.y, screenX, screenY);
          if (sprite) {
            // Dim explored but not visible tiles
            if (!isVisible && usingShadowFov) {
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

    // Render entities (items first, then monsters), excluding local player
    const sortedEntities = entities
      .filter((e) => e.kind !== EntityKind.PLAYER || e.id !== player.id)
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

      const tileIndex = entity.gridX + entity.gridY * state.mapWidth;
      const shouldRenderEntity = usingShadowFov
        ? enhancedVision
          ? explored.has(tileIndex)
          : visible.has(tileIndex)
        : true;
      if (!shouldRenderEntity) continue;

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
      } else if (entity.kind === EntityKind.PLAYER) {
        const remotePlayer = entity as any;
        const isDead = remotePlayer.hp <= 0;
        const moving = this.isEntityMoving(remotePlayer);
        const facing = this.getEntityDirection(remotePlayer);
        coord = isDead
          ? SPRITE_COORDS["player_dead"]
          : moving
            ? PLAYER_WALK_FRAMES[facing][
                this.getWalkFrameIndex(
                  nowMs,
                  PLAYER_WALK_FRAMES[facing].length,
                  160,
                  41,
                )
              ]
            : PLAYER_IDLE_FRAMES[facing];
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
          } else if (entity.kind === EntityKind.PLAYER) {
            const remotePlayer = entity as any;
            const isDead = remotePlayer.hp <= 0;
            if (!isDead) {
              sprite.tint = 0xa7f3d0;
            }
            const facing = this.getEntityDirection(entity as any);
            if (!isDead && (facing === "right" || facing === "left")) {
              sprite.scale.x = facing === "right" ? -1 : 1;
            }
          } else if (
            entity.kind === EntityKind.MONSTER &&
            (entity as any).type === MonsterType.SKULKER
          ) {
            sprite.tint = 0x88ff88;
          }

          // Hit flash overrides any existing tint
          const hasHitFlash = effects.some(
            (e) => e.type === "hit_flash" && e.entityId === entity.id,
          );
          if (hasHitFlash) {
            sprite.tint = 0xff3333;
          }

          this.entityContainer.addChild(sprite);
        }
      }
    }

    // Render effects: explosions and sparks
    for (const effect of effects) {
      if (effect.type === "explosion") {
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
      } else if (effect.type === "spark") {
        const screenX = offsetX + effect.worldX;
        const screenY = offsetY + effect.worldY;
        const sprite = this.createSprite(
          SPRITE_COORDS.bullet.x,
          SPRITE_COORDS.bullet.y,
          screenX,
          screenY,
        );
        if (sprite) {
          sprite.anchor.set(0.5, 0.5);
          sprite.scale.set(0.5);
          sprite.tint = 0xffffff;
          sprite.alpha = 1 - effect.ageTicks / effect.durationTicks;
          this.entityContainer.addChild(sprite);
        }
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
        sprite.anchor.set(0.5, 0.5);

        if (!isDead && (playerFacing === "right" || playerFacing === "left")) {
          sprite.scale.x = playerFacing === "right" ? -1 : 1;
        }

        const playerHitFlash = effects.some(
          (e) => e.type === "hit_flash" && e.entityId === player.id,
        );
        if (playerHitFlash) {
          sprite.tint = 0xff3333;
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
