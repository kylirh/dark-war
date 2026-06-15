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
  CELL_CONFIG,
  TileType,
  MonsterType,
  FLOOR_DAMAGE_THRESHOLDS,
  WALL_DAMAGE_THRESHOLDS,
} from "../../engine/types";
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
  SpriteFrame,
  SpriteShadowSize,
  SPRITE_FRAMES,
  holeAutotileCoordinate,
  wallAutotileCoordinate,
} from "../../engine/config/sprites";
import { wrapValue, nearestWrappedImage } from "../../engine/utils/wrap";
import { cardinalAutotileMask } from "../../engine/utils/autotile";

type RenderFrame = SpriteFrame & { key: string };

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
  private shadowTextureCache: Map<SpriteShadowSize, Texture> = new Map();
  private glowTextureCache: Map<string, Texture> = new Map();
  private ready: boolean = false;
  private pendingRender?: { state: GameState; isDead: boolean };
  private viewportElement?: HTMLElement;
  private scale: number = 1.0; // Configurable scale factor
  private cameraWorldX: number = 0; // Camera center (world px), smooth-followed
  private cameraWorldY: number = 0;
  private camLeftWorld: number = 0; // Window top-left (world px), after clamping
  private camTopWorld: number = 0;
  private playerFacing: FacingDirection = "down";
  private shakeIntensity: number = 0;
  private resizeObserver?: ResizeObserver;
  private resizeDebounceTimer?: ReturnType<typeof setTimeout>;

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
    this.entityContainer.sortableChildren = true;

    // Initialize app asynchronously
    this.initAsync(canvas);
  }

  /**
   * Initialize Pixi.js application and load sprite sheet
   */
  private async initAsync(canvas: HTMLCanvasElement): Promise<void> {
    // Windowed rendering: the canvas is sized to the visible viewport (not the
    // whole map). Each frame we draw only the tiles in a window around the
    // camera, so the world can be arbitrarily large — and can wrap (level 0)
    // — without a giant canvas or DOM scrolling.
    const { width: canvasWidth, height: canvasHeight } =
      this.computeViewportPixels();

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

    const spriteSheetUrl = "./assets/img/sprites.png?v=autotiles-1";
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
      this.observeViewportResize();

      if (this.pendingRender) {
        this.render(this.pendingRender.state, this.pendingRender.isDead);
        this.pendingRender = undefined;
      }
    }
  }

  /**
   * Resize the drawing buffer when the viewport settles after a window resize.
   * Debounced so a live drag-resize doesn't reallocate the WebGL buffer on every
   * frame (which janked the main thread and could leave the OS cursor stuck in
   * resize mode). The CSS keeps the canvas filled during the drag.
   */
  private observeViewportResize(): void {
    if (this.resizeObserver || !this.viewportElement) return;
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = setTimeout(() => this.resizeToViewport(), 120);
    });
    this.resizeObserver.observe(this.viewportElement);
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
   * Set the zoom factor. The canvas stays sized to the viewport; a larger scale
   * just shows fewer (bigger) world tiles in the same window.
   */
  public setScale(newScale: number): void {
    this.scale = newScale;
    this.app.stage.scale.set(this.scale);
    this.resizeToViewport();
  }

  /**
   * The canvas's pixel dimensions, matched to the visible viewport element.
   * Falls back to a reasonable default before the DOM has laid out.
   */
  private computeViewportPixels(): { width: number; height: number } {
    const el = this.viewportElement;
    const cssWidth = el && el.clientWidth > 0 ? el.clientWidth : 960;
    const cssHeight = el && el.clientHeight > 0 ? el.clientHeight : 640;
    return {
      width: Math.max(1, Math.floor(cssWidth)),
      height: Math.max(1, Math.floor(cssHeight)),
    };
  }

  /**
   * Resize the Pixi canvas to fill the viewport if its size has changed
   * (window resize, panel toggles). Cheap no-op when nothing moved.
   */
  private resizeToViewport(): void {
    const { width, height } = this.computeViewportPixels();
    if (
      this.app.renderer.width === width &&
      this.app.renderer.height === height
    ) {
      return;
    }
    this.app.renderer.resize(width, height);
  }

  /** The visible window size in world pixels (canvas pixels / zoom). */
  private getViewWorldSize(): { viewW: number; viewH: number } {
    return {
      viewW: this.app.renderer.width / this.scale,
      viewH: this.app.renderer.height / this.scale,
    };
  }

  /**
   * Clamp a camera window's top-left so it never reveals past a bounded map's
   * edge. If the map is smaller than the window, centre it instead.
   */
  private clampCamera(topLeft: number, world: number, view: number): number {
    if (world <= view) return (world - view) / 2;
    return Math.max(0, Math.min(topLeft, world - view));
  }

  /**
   * On a wrapping world, pick the image of a world coordinate nearest the camera
   * centre so entities/effects near the seam draw on the side the camera faces.
   * On bounded worlds this is the identity.
   */
  private wrapImage(
    value: number,
    center: number,
    span: number,
    wraps: boolean,
  ): number {
    return wraps ? nearestWrappedImage(value, center, span) : value;
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
        const isRevealed = usingShadowFov
          ? state.explored.has(tileIndex)
          : true;
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
          mapX,
          mapY,
          screenX,
          screenY,
          alpha,
        );
      }
    }

    const sortedEntities = state.entities
      .filter(
        (entity) =>
          entity.kind !== EntityKind.PLAYER || entity.id !== player.id,
      )
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
      const frameKey = this.getPreviewEntityFrameKey(entity);
      this.drawPreviewSprite(
        context,
        coord,
        entity.worldX - minGridX * CELL_CONFIG.w,
        entity.worldY - minGridY * CELL_CONFIG.h + CELL_CONFIG.h / 2,
        1,
        frameKey,
      );
    }

    const playerCoord =
      player.hp <= 0
        ? SPRITE_COORDS["player_dead"]
        : PLAYER_IDLE_FRAMES[this.playerFacing];
    this.drawPreviewSprite(
      context,
      playerCoord,
      player.worldX - minGridX * CELL_CONFIG.w,
      player.worldY - minGridY * CELL_CONFIG.h + CELL_CONFIG.h / 2,
      1,
      player.hp <= 0 ? "player_dead" : "player_walk_down_1",
    );

    return this.canvasToPreviewDataUrl(sourceCanvas);
  }

  private drawTilePreviewSprites(
    context: CanvasRenderingContext2D,
    tileType: TileType,
    state: GameState,
    tileIndex: number,
    mapX: number,
    mapY: number,
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
      const holeMask = cardinalAutotileMask(
        mapX,
        mapY,
        (x, y) =>
          x >= 0 &&
          y >= 0 &&
          x < state.mapWidth &&
          y < state.mapHeight &&
          state.tiles.getTile(x, y) === TileType.HOLE,
      );
      overlayCoord = holeAutotileCoordinate(holeMask);
    }

    const needsFloorBase =
      tileType === TileType.DOOR_CLOSED ||
      tileType === TileType.DOOR_OPEN ||
      tileType === TileType.DOOR_LOCKED ||
      tileType === TileType.STAIRS_DOWN ||
      tileType === TileType.STAIRS_UP;

    if (needsFloorBase) {
      this.drawPreviewSprite(
        context,
        floorCoord,
        screenX,
        screenY,
        alpha,
        TileType.FLOOR,
      );
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
      const wallMask = cardinalAutotileMask(mapX, mapY, (x, y) => {
        if (x < 0 || y < 0 || x >= state.mapWidth || y >= state.mapHeight) {
          return false;
        }
        const neighbor = state.tiles.getTile(x, y);
        return (
          neighbor === TileType.WALL ||
          neighbor === TileType.DOOR_CLOSED ||
          neighbor === TileType.DOOR_OPEN ||
          neighbor === TileType.DOOR_LOCKED
        );
      });
      tileCoord = wallAutotileCoordinate(wallSpriteKey, wallMask);
    } else if (tileType !== TileType.FLOOR && tileType !== TileType.HOLE) {
      tileCoord = SPRITE_COORDS[tileType];
    }

    if (baseCoord)
      this.drawPreviewSprite(
        context,
        baseCoord,
        screenX,
        screenY,
        alpha,
        tileType === TileType.FLOOR ? TileType.FLOOR : undefined,
      );
    if (overlayCoord) {
      this.drawPreviewSprite(
        context,
        overlayCoord,
        screenX,
        screenY,
        alpha,
        tileType === TileType.HOLE ? "hole" : undefined,
      );
    }
    if (tileCoord) {
      const isFlatTile =
        tileType === TileType.STAIRS_UP ||
        (tileType === TileType.STAIRS_DOWN && state.levelKind !== "outside");
      const verticalKey =
        tileType === TileType.WALL
          ? state.wallSet === "wood"
            ? "wall_wood"
            : TileType.WALL
          : state.levelKind === "outside" && tileType === TileType.STAIRS_DOWN
            ? "megacorp_entrance"
            : tileType;
      this.drawPreviewSprite(
        context,
        tileCoord,
        isFlatTile ? screenX : screenX + CELL_CONFIG.w / 2,
        isFlatTile ? screenY : screenY + CELL_CONFIG.h,
        alpha,
        verticalKey,
      );
    }
  }

  private getPreviewEntityFrameKey(
    entity: GameState["entities"][number],
  ): string | number | undefined {
    if (entity.kind === EntityKind.MONSTER) {
      return entity.type;
    }
    if (entity.kind === EntityKind.ITEM) {
      return entity.type;
    }
    if (entity.kind === EntityKind.EXPLOSIVE) {
      if (entity.type === ItemType.LAND_MINE && entity.armed) {
        return "land_mine_active";
      }
      return entity.type;
    }
    if (entity.kind === EntityKind.BULLET) {
      return (entity as { thrownItem?: ItemType }).thrownItem ?? "bullet";
    }
    if (entity.kind === EntityKind.PLAYER) {
      return entity.hp <= 0 ? "player_dead" : "player_walk_down_1";
    }
    return undefined;
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
    frameKey?: string | number,
  ): void {
    if (!this.spriteSheetImage) return;
    const frame = this.resolveFrame(coord, frameKey);
    const destX =
      frame.anchorX === 0
        ? screenX
        : screenX - frame.renderWidth * frame.anchorX;
    const destY =
      frame.anchorY === 0
        ? screenY
        : screenY - frame.renderHeight * frame.anchorY + frame.yOffset;
    context.save();
    context.globalAlpha = alpha;
    context.drawImage(
      this.spriteSheetImage,
      frame.x * SPRITE_SIZE,
      frame.y * SPRITE_SIZE,
      frame.width * SPRITE_SIZE,
      frame.height * SPRITE_SIZE,
      Math.round(destX),
      Math.round(destY),
      frame.renderWidth,
      frame.renderHeight,
    );
    context.restore();
  }

  private resolveFrame(
    coord: { x: number; y: number },
    frameKey?: string | number,
  ): RenderFrame {
    const key = String(frameKey ?? `${coord.x},${coord.y}`);
    const overrides = frameKey !== undefined ? SPRITE_FRAMES[key] : undefined;
    const billboardDefault = frameKey !== undefined;
    return {
      key,
      x: coord.x,
      y: coord.y,
      width: overrides?.width ?? 1,
      height: overrides?.height ?? 1,
      renderWidth: overrides?.renderWidth ?? CELL_CONFIG.w,
      renderHeight: overrides?.renderHeight ?? CELL_CONFIG.h,
      anchorX: overrides?.anchorX ?? (billboardDefault ? 0.5 : 0),
      anchorY: overrides?.anchorY ?? (billboardDefault ? 1 : 0),
      yOffset: overrides?.yOffset ?? 0,
      depthOffset: overrides?.depthOffset ?? 0,
      shadow: overrides?.shadow ?? (billboardDefault ? "small" : "none"),
    };
  }

  private resolveFrameForKey(frameKey: string | number): RenderFrame | null {
    const coord = SPRITE_COORDS[frameKey];
    if (!coord) return null;
    return this.resolveFrame(coord, frameKey);
  }

  /**
   * Textures are cached to prevent memory leaks
   */
  private getTexture(
    x: number,
    y: number,
    width: number = 1,
    height: number = 1,
  ): Texture | null {
    if (!this.spriteSheet) return null;

    const key = `${x},${y},${width},${height}`;

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
        width * SPRITE_SIZE,
        height * SPRITE_SIZE,
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

  private createSpriteFromFrame(
    frame: RenderFrame,
    screenX: number,
    screenY: number,
  ): Sprite | null {
    const texture = this.getTexture(
      frame.x,
      frame.y,
      frame.width,
      frame.height,
    );
    if (!texture) return null;

    const sprite = new Sprite(texture);
    sprite.x = screenX;
    sprite.y = screenY + frame.yOffset;
    sprite.width = frame.renderWidth;
    sprite.height = frame.renderHeight;
    sprite.anchor.set(frame.anchorX, frame.anchorY);
    return sprite;
  }

  private getShadowTexture(size: SpriteShadowSize): Texture | null {
    if (size === "none") return null;
    if (this.shadowTextureCache.has(size)) {
      return this.shadowTextureCache.get(size)!;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const alphaBySize: Record<SpriteShadowSize, number> = {
      none: 0,
      small: 0.24,
      medium: 0.28,
      large: 0.32,
      huge: 0.36,
    };
    context.fillStyle = `rgba(0, 0, 0, ${alphaBySize[size]})`;
    context.beginPath();
    context.ellipse(32, 18, 25, 8, 0, 0, Math.PI * 2);
    context.fill();

    const texture = Texture.from(canvas);
    this.shadowTextureCache.set(size, texture);
    return texture;
  }

  private addShadow(
    container: Container,
    size: SpriteShadowSize,
    screenX: number,
    screenY: number,
    zIndex: number,
  ): void {
    const texture = this.getShadowTexture(size);
    if (!texture) return;

    const scaleBySize: Record<SpriteShadowSize, [number, number]> = {
      none: [0, 0],
      small: [0.48, 0.38],
      medium: [0.66, 0.48],
      large: [0.92, 0.58],
      huge: [1.18, 0.72],
    };
    const [scaleX, scaleY] = scaleBySize[size];
    const shadow = new Sprite(texture);
    shadow.anchor.set(0.5, 0.5);
    shadow.x = screenX;
    shadow.y = screenY - 3;
    shadow.scale.set(scaleX, scaleY);
    shadow.zIndex = zIndex - 0.5;
    container.addChild(shadow);
  }

  private getGlowTexture(color: string): Texture | null {
    if (this.glowTextureCache.has(color)) {
      return this.glowTextureCache.get(color)!;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const gradient = context.createRadialGradient(48, 48, 4, 48, 48, 48);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.4, color.replace("0.28", "0.12"));
    gradient.addColorStop(1, color.replace("0.28", "0"));
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.glowTextureCache.set(color, texture);
    return texture;
  }

  private addGlow(
    container: Container,
    color: string,
    screenX: number,
    screenY: number,
    zIndex: number,
    scale: number = 1,
  ): void {
    const texture = this.getGlowTexture(color);
    if (!texture) return;

    const glow = new Sprite(texture);
    glow.anchor.set(0.5, 0.5);
    glow.x = screenX;
    glow.y = screenY;
    glow.scale.set(scale);
    glow.zIndex = zIndex - 0.25;
    container.addChild(glow);
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

    // ----- Camera (windowed; wrap-aware on the toroidal outside world) -----
    const wraps = state.levelKind === "outside";
    const worldW = state.mapWidth * CELL_CONFIG.w;
    const worldH = state.mapHeight * CELL_CONFIG.h;

    if ("worldX" in player) {
      const targetX = (player as any).worldX;
      const targetY = (player as any).worldY;
      if (state.sim.mode === "REALTIME") {
        // Smooth follow (15%/frame). On a wrapping world, lerp toward the
        // nearest wrapped image of the player so the camera takes the short way
        // across the seam instead of sweeping the whole map, then re-wrap.
        if (wraps) {
          const imgX = nearestWrappedImage(targetX, this.cameraWorldX, worldW);
          const imgY = nearestWrappedImage(targetY, this.cameraWorldY, worldH);
          this.cameraWorldX = wrapValue(
            this.cameraWorldX + (imgX - this.cameraWorldX) * 0.15,
            worldW,
          );
          this.cameraWorldY = wrapValue(
            this.cameraWorldY + (imgY - this.cameraWorldY) * 0.15,
            worldH,
          );
        } else {
          this.cameraWorldX += (targetX - this.cameraWorldX) * 0.15;
          this.cameraWorldY += (targetY - this.cameraWorldY) * 0.15;
        }
      } else {
        // Planning mode: snap camera to the player.
        this.cameraWorldX = targetX;
        this.cameraWorldY = targetY;
      }
    }

    // Clear previous frame
    this.mapContainer.removeChildren();
    this.entityContainer.removeChildren();

    // Window top-left in world pixels. Bounded levels clamp so the camera never
    // shows past the map edge; the wrapping world is free (the seam is hidden by
    // wrapped tile lookups below).
    const { viewW, viewH } = this.getViewWorldSize();
    let camLeft = this.cameraWorldX - viewW / 2;
    let camTop = this.cameraWorldY - viewH / 2;
    if (!wraps) {
      camLeft = this.clampCamera(camLeft, worldW, viewW);
      camTop = this.clampCamera(camTop, worldH, viewH);
    }
    // Remember the window origin so the mouse tracker can map canvas → world.
    this.camLeftWorld = camLeft;
    this.camTopWorld = camTop;
    // A world position X maps to screen position (offsetX + X). Entities and
    // effects reuse these offsets directly below.
    const offsetX = -camLeft;
    const offsetY = -camTop;
    const camCenterX = this.cameraWorldX;
    const camCenterY = this.cameraWorldY;

    // ----- Tiles: only the cells inside the camera window -----
    const startCol = Math.floor(camLeft / CELL_CONFIG.w) - 1;
    const endCol = Math.floor((camLeft + viewW) / CELL_CONFIG.w) + 1;
    const startRow = Math.floor(camTop / CELL_CONFIG.h) - 1;
    const endRow = Math.floor((camTop + viewH) / CELL_CONFIG.h) + 1;

    const hashTile = (x: number, y: number, salt: number = 0): number => {
      let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
      h = (h ^ (h >>> 13)) | 0;
      h = Math.imul(h, 1274126177);
      return (h ^ (h >>> 16)) >>> 0;
    };

    const tileAtWindow = (x: number, y: number): TileType | null => {
      let mx = x;
      let my = y;
      if (wraps) {
        mx = wrapValue(x, state.mapWidth);
        my = wrapValue(y, state.mapHeight);
      } else if (
        x < 0 ||
        y < 0 ||
        x >= state.mapWidth ||
        y >= state.mapHeight
      ) {
        return null;
      }
      return state.tiles.getTile(mx, my);
    };

    for (let tileY = startRow; tileY <= endRow; tileY++) {
      for (let tileX = startCol; tileX <= endCol; tileX++) {
        // Map coords (wrapped on the torus); screen coords use the unwrapped
        // window coords so the row/column stays contiguous on screen.
        let mx = tileX;
        let my = tileY;
        if (wraps) {
          mx = wrapValue(tileX, state.mapWidth);
          my = wrapValue(tileY, state.mapHeight);
        } else if (
          tileX < 0 ||
          tileY < 0 ||
          tileX >= state.mapWidth ||
          tileY >= state.mapHeight
        ) {
          continue;
        }

        const tileIndex = mx + my * state.mapWidth;
        const isRevealed = usingShadowFov ? explored.has(tileIndex) : true;
        const isVisible = usingShadowFov
          ? enhancedVision
            ? explored.has(tileIndex)
            : visible.has(tileIndex)
          : true;
        const tileType = state.tiles.getTile(mx, my);

        if (!isRevealed) continue;

        const screenX = offsetX + tileX * CELL_CONFIG.w;
        const screenY = offsetY + tileY * CELL_CONFIG.h;
        const tileBaselineX = screenX + CELL_CONFIG.w / 2;
        const tileBaselineY = screenY + CELL_CONFIG.h;
        const tileSortY = tileY * CELL_CONFIG.h + CELL_CONFIG.h;

        const floorVariant = state.floorVariant ?? 0;
        const floorCoord =
          FLOOR_VARIANTS[floorVariant] || SPRITE_COORDS[TileType.FLOOR];
        const damage = state.wallDamage[tileIndex] || 0;

        const applyFovAlpha = (sprite: Sprite): void => {
          if (!isVisible && usingShadowFov) {
            sprite.alpha = 0.45;
          }
        };

        const renderGround = (
          key: string | number,
          coordOverride?: { x: number; y: number },
        ): void => {
          const coord = coordOverride ?? SPRITE_COORDS[key];
          if (!coord) return;
          const frame = this.resolveFrame(coord, key);
          const sprite = this.createSpriteFromFrame(frame, screenX, screenY);
          if (sprite) {
            applyFovAlpha(sprite);
            this.mapContainer.addChild(sprite);
          }
        };

        const renderDepthTile = (
          key: string | number,
          coordOverride?: { x: number; y: number },
        ): void => {
          const coord = coordOverride ?? SPRITE_COORDS[key];
          if (!coord) return;
          const frame = this.resolveFrame(coord, key);
          const sortY = tileSortY + frame.depthOffset;
          this.addShadow(
            this.entityContainer,
            frame.shadow,
            tileBaselineX,
            tileBaselineY,
            sortY,
          );
          const sprite = this.createSpriteFromFrame(
            frame,
            tileBaselineX,
            tileBaselineY,
          );
          if (!sprite) return;
          applyFovAlpha(sprite);
          sprite.zIndex = sortY;
          this.entityContainer.addChild(sprite);
        };

        const renderDecoration = (
          key: string,
          depthOffset: number = 0,
          glow?: { color: string; scale: number },
        ): void => {
          const frame = this.resolveFrameForKey(key);
          if (!frame) return;
          const sortY = tileSortY + frame.depthOffset + depthOffset;
          if (glow) {
            this.addGlow(
              this.entityContainer,
              glow.color,
              tileBaselineX,
              tileBaselineY - frame.renderHeight * 0.55,
              sortY,
              glow.scale,
            );
          }
          this.addShadow(
            this.entityContainer,
            frame.shadow,
            tileBaselineX,
            tileBaselineY,
            sortY,
          );
          const sprite = this.createSpriteFromFrame(
            frame,
            tileBaselineX,
            tileBaselineY,
          );
          if (!sprite) return;
          applyFovAlpha(sprite);
          sprite.zIndex = sortY;
          this.entityContainer.addChild(sprite);
        };

        if (tileType === TileType.FLOOR) {
          renderGround(TileType.FLOOR, floorCoord);
          if (damage >= FLOOR_DAMAGE_THRESHOLDS[0]) {
            renderGround("floor_damaged");
          }
          const h = hashTile(mx, my, 22);
          if (state.levelKind === "dungeon" && h % 97 === 0) {
            renderGround("blood_stain");
          }
        } else if (tileType === TileType.HOLE) {
          renderGround(TileType.FLOOR, floorCoord);
          const holeMask = cardinalAutotileMask(
            tileX,
            tileY,
            (x, y) => tileAtWindow(x, y) === TileType.HOLE,
          );
          renderGround("hole", holeAutotileCoordinate(holeMask));
        } else if (tileType === TileType.GRASS) {
          renderGround(
            hashTile(mx, my, 3) % 17 === 0 ? "grass_flowers" : TileType.GRASS,
          );
          renderDepthTile("grass_blades");
        } else if (tileType === TileType.WEEDS) {
          renderGround(
            hashTile(mx, my, 4) % 4 === 0 ? "weeds_dense" : TileType.WEEDS,
          );
          renderDepthTile("weeds_blades");
        } else if (tileType === TileType.ASPHALT) {
          renderGround(
            hashTile(mx, my, 5) % 9 === 0
              ? "asphalt_cracked"
              : TileType.ASPHALT,
          );
        } else if (tileType === TileType.SIDEWALK) {
          renderGround(
            hashTile(mx, my, 6) % 7 === 0
              ? "sidewalk_cracked"
              : TileType.SIDEWALK,
          );
          if (
            state.levelKind === "outside" &&
            hashTile(mx, my, 77) % 151 === 0
          ) {
            renderDecoration("streetlight", 1, {
              color: "rgba(255, 214, 112, 0.28)",
              scale: 0.85,
            });
          }
        } else if (
          tileType === TileType.DOOR_CLOSED ||
          tileType === TileType.DOOR_OPEN ||
          tileType === TileType.DOOR_LOCKED ||
          tileType === TileType.STAIRS_DOWN ||
          tileType === TileType.STAIRS_UP
        ) {
          renderGround(TileType.FLOOR, floorCoord);
          if (
            state.levelKind === "outside" &&
            tileType === TileType.STAIRS_DOWN
          ) {
            renderDepthTile("megacorp_entrance");
          } else if (
            tileType === TileType.DOOR_CLOSED ||
            tileType === TileType.DOOR_OPEN ||
            tileType === TileType.DOOR_LOCKED
          ) {
            renderDepthTile(tileType);
          } else {
            renderGround(tileType);
          }
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
          const wallMask = cardinalAutotileMask(tileX, tileY, (x, y) => {
            const neighbor = tileAtWindow(x, y);
            return (
              neighbor === TileType.WALL ||
              neighbor === TileType.DOOR_CLOSED ||
              neighbor === TileType.DOOR_OPEN ||
              neighbor === TileType.DOOR_LOCKED
            );
          });
          renderDepthTile(
            wallSpriteKey,
            wallAutotileCoordinate(wallSpriteKey, wallMask),
          );
        } else if (
          tileType === TileType.TREE ||
          tileType === TileType.BUILDING ||
          tileType === TileType.FENCE ||
          tileType === TileType.RUBBLE
        ) {
          if (tileType === TileType.BUILDING) {
            const below = tileAtWindow(tileX, tileY + 1);
            if (below === TileType.BUILDING) {
              renderGround("building_roof");
            } else {
              renderDepthTile(TileType.BUILDING);
            }
          } else if (tileType === TileType.FENCE) {
            const vertical =
              tileAtWindow(tileX, tileY - 1) === TileType.FENCE ||
              tileAtWindow(tileX, tileY + 1) === TileType.FENCE;
            renderDepthTile(vertical ? "fence_vertical" : "fence_horizontal");
          } else {
            renderDepthTile(tileType);
          }
        } else {
          renderGround(tileType);
        }
      }
    }

    const getEntityScreenPosition = (entity: GameState["entities"][number]) => {
      if ("worldX" in entity) {
        const worldX = this.wrapImage(entity.worldX, camCenterX, worldW, wraps);
        const worldY = this.wrapImage(entity.worldY, camCenterY, worldH, wraps);
        return {
          screenX: offsetX + worldX,
          screenY: offsetY + worldY,
          sortY: worldY + CELL_CONFIG.h / 2,
        };
      }
      const worldX = (entity as any).x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
      const worldY = (entity as any).y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
      return {
        screenX: offsetX + worldX,
        screenY: offsetY + worldY,
        sortY: worldY + CELL_CONFIG.h / 2,
      };
    };

    const playerFrameKey = (
      moving: boolean,
      facing: FacingDirection,
      dead: boolean,
      offsetMs: number = 0,
    ): string => {
      if (dead) return "player_dead";
      if (!moving) {
        if (facing === "down") return "player_walk_down_1";
        if (facing === "up") return "player_walk_up_1";
        return "player_walk_side_1";
      }
      const frameIndex = this.getWalkFrameIndex(nowMs, 2, 160, offsetMs) + 1;
      if (facing === "down") return `player_walk_down_${frameIndex}`;
      if (facing === "up") return `player_walk_up_${frameIndex}`;
      return `player_walk_side_${frameIndex}`;
    };

    const renderDepthEntity = (
      entity: GameState["entities"][number],
      forceDead: boolean = false,
    ): void => {
      if (!("gridX" in entity) || !("gridY" in entity)) return;

      const tileIndex = entity.gridX + entity.gridY * state.mapWidth;
      const shouldRenderEntity = usingShadowFov
        ? enhancedVision
          ? explored.has(tileIndex)
          : visible.has(tileIndex)
        : true;
      if (!shouldRenderEntity) return;

      const { screenX, screenY, sortY } = getEntityScreenPosition(entity);
      const baselineY =
        entity.kind === EntityKind.BULLET
          ? screenY
          : screenY + CELL_CONFIG.h / 2;
      let frame: RenderFrame | null = null;
      let facing: FacingDirection | null = null;

      if (entity.kind === EntityKind.MONSTER && "type" in entity) {
        const monsterType = entity.type as MonsterType;
        const moving = this.isEntityMoving(entity);
        const frames = MONSTER_WALK_FRAMES[monsterType];
        if (moving && frames && frames.length > 1) {
          const frameIndex = this.getWalkFrameIndex(nowMs, frames.length, 180);
          frame = this.resolveFrame(frames[frameIndex], monsterType);
        } else {
          frame = this.resolveFrameForKey(monsterType);
        }
      } else if (entity.kind === EntityKind.PLAYER) {
        const remotePlayer = entity as any;
        const dead = forceDead || remotePlayer.hp <= 0;
        const moving = this.isEntityMoving(remotePlayer);
        facing = this.getEntityDirection(remotePlayer);
        frame = this.resolveFrameForKey(
          playerFrameKey(moving, facing, dead, 41),
        );
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
          frame = this.resolveFrameForKey("land_mine_active");
        } else {
          frame = this.resolveFrameForKey(entity.type);
        }
      } else if (entity.kind === EntityKind.BULLET) {
        const thrown = (entity as { thrownItem?: ItemType }).thrownItem;
        frame = this.resolveFrameForKey(thrown ?? "bullet");
      }

      if (!frame) return;

      const zIndex = sortY + frame.depthOffset;
      this.addShadow(
        this.entityContainer,
        frame.shadow,
        screenX,
        baselineY,
        zIndex,
      );
      const sprite = this.createSpriteFromFrame(frame, screenX, baselineY);
      if (!sprite) return;
      sprite.zIndex = zIndex;

      if (entity.kind === EntityKind.BULLET && "facingAngle" in entity) {
        sprite.rotation = (entity as any).facingAngle;
      } else if (entity.kind === EntityKind.PLAYER) {
        const remotePlayer = entity as any;
        const dead = forceDead || remotePlayer.hp <= 0;
        if (!dead) {
          sprite.tint = 0xa7f3d0;
        }
        if (!dead && facing && (facing === "right" || facing === "left")) {
          sprite.scale.x =
            facing === "right"
              ? -Math.abs(sprite.scale.x)
              : Math.abs(sprite.scale.x);
        }
      } else if (
        entity.kind === EntityKind.MONSTER &&
        (entity as any).type === MonsterType.SKULKER
      ) {
        sprite.tint = 0x88ff88;
      } else if (
        entity.kind === EntityKind.MONSTER &&
        (entity as any).type === MonsterType.CYBERCOP
      ) {
        sprite.alpha = 0.22;
        sprite.tint = 0x9fc8ff;
      }

      const hasHitFlash = effects.some(
        (e) => e.type === "hit_flash" && e.entityId === entity.id,
      );
      if (hasHitFlash) {
        sprite.tint = 0xff3333;
      }

      this.entityContainer.addChild(sprite);
    };

    for (const entity of entities) {
      if (entity.kind !== EntityKind.PLAYER || entity.id !== player.id) {
        renderDepthEntity(entity);
      }
    }

    // Render effects into the same depth pass so tall walls can occlude them.
    for (const effect of effects) {
      const screenX =
        offsetX + this.wrapImage(effect.worldX, camCenterX, worldW, wraps);
      const screenY =
        offsetY + this.wrapImage(effect.worldY, camCenterY, worldH, wraps);
      const sortY = this.wrapImage(effect.worldY, camCenterY, worldH, wraps);

      if (effect.type === "explosion") {
        const frameIndex = Math.min(
          EXPLOSION_FRAMES.length - 1,
          Math.floor(
            (effect.ageTicks / effect.durationTicks) * EXPLOSION_FRAMES.length,
          ),
        );
        const frame = this.resolveFrame(
          EXPLOSION_FRAMES[frameIndex],
          `explosion_${frameIndex + 1}`,
        );
        const sprite = this.createSpriteFromFrame(frame, screenX, screenY);
        if (sprite) {
          sprite.zIndex = sortY + frame.depthOffset;
          this.entityContainer.addChild(sprite);
        }
      } else if (effect.type === "spark") {
        const frame = this.resolveFrameForKey("bullet");
        if (!frame) continue;
        const sprite = this.createSpriteFromFrame(frame, screenX, screenY);
        if (sprite) {
          sprite.scale.set(0.5);
          sprite.tint = 0xffffff;
          sprite.alpha = 1 - effect.ageTicks / effect.durationTicks;
          sprite.zIndex = sortY + 12;
          this.entityContainer.addChild(sprite);
        }
      }
    }

    const playerMoving = this.isEntityMoving(player);
    if (playerMoving) {
      this.playerFacing = this.getEntityDirection(player);
    }
    renderDepthEntity(player, isDead);
  }

  /**
   * Snap (or, when smoothing, leave) the windowed camera on the player. With
   * windowed rendering the camera follows the player every frame inside
   * `render()`, so this is only used on level transitions / new games to jump
   * the camera instantly rather than panning across the level. The `smooth`
   * flag is kept for call-site compatibility; smoothing happens in `render()`.
   */
  public centerOnPlayer(
    player: { gridX: number; gridY: number; worldX?: number; worldY?: number },
    smooth: boolean = true,
  ): void {
    const playerWorldX =
      typeof player.worldX === "number"
        ? player.worldX
        : player.gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const playerWorldY =
      typeof player.worldY === "number"
        ? player.worldY
        : player.gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    if (!smooth) {
      // Hard snap (level change / respawn) so the camera doesn't sweep.
      this.cameraWorldX = playerWorldX;
      this.cameraWorldY = playerWorldY;
    }
  }

  /**
   * The world-pixel coordinate of the camera window's top-left corner, so the
   * mouse tracker can convert canvas pixels to world coordinates.
   */
  public getCameraTopLeft(): { x: number; y: number } {
    return { x: this.camLeftWorld, y: this.camTopWorld };
  }
}
