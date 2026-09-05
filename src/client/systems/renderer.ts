import {
  WebGLRenderer,
  Container,
  Graphics,
  Sprite,
  Texture,
  Assets,
  Rectangle,
} from "pixi.js";
import {
  BeamPoint,
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
import { getStateDamageAtIndex } from "../../engine/utils/state-tiles";
import {
  hashWorldVisualCoordinate,
  mixWorldVisualHash,
  ResolvedBuildingPart,
  ResolvedCliffMagnitude,
  ResolvedFenceOrientation,
} from "../../engine/systems/terrain/world-visual-resolver";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../../engine/core/world-semantics";
import {
  PrototypeCliffVisual,
  PrototypeGround,
  PrototypeGroundVisual,
  PrototypeStructure,
  TerrainPrototypeTransitionMode,
} from "../../engine/systems/terrain/terrain-prototype";
import {
  ELEVATION_EAST,
  ELEVATION_NORTH,
  ELEVATION_SOUTH,
  ELEVATION_WEST,
} from "../../engine/systems/terrain/elevation-resolver";
import { WorldCalloutView } from "./world-callout-manager";
import { AnchoredWorldCallout, WorldCalloutLayer } from "./world-callout-layer";
import {
  DUAL_GRID_NORTH_EAST,
  DUAL_GRID_NORTH_WEST,
  DUAL_GRID_SOUTH_EAST,
  DUAL_GRID_SOUTH_WEST,
  TRANSITION_EAST,
  TRANSITION_NORTH,
  TRANSITION_NORTH_EAST,
  TRANSITION_NORTH_WEST,
  TRANSITION_SOUTH,
  TRANSITION_SOUTH_EAST,
  TRANSITION_SOUTH_WEST,
  TRANSITION_WEST,
} from "../../engine/systems/terrain/terrain-transition-resolver";

type RenderFrame = SpriteFrame & { key: string };

/** Client-only Matter Manipulator overlay: cursor highlight + mining lightning. */
export interface MatterManipulatorOverlay {
  active: boolean;
  cursorTileX: number;
  cursorTileY: number;
  hasCursorTile: boolean;
  inRange: boolean;
  zapTiles: { tileX: number; tileY: number }[];
}

/**
 * Handles rendering the game using Pixi.js
 */
export class Renderer {
  private pixi: WebGLRenderer;
  private stage: Container;
  private readonly canvas: HTMLCanvasElement;
  private mapContainer: Container;
  private entityContainer: Container;
  private worldCalloutContainer: Container;
  private worldCalloutLayer: WorldCalloutLayer;
  private mmOverlay: MatterManipulatorOverlay | null = null;
  private spriteSheet?: Texture;
  private spriteSheetImage?: HTMLImageElement;
  private textureCache: Map<string, Texture> = new Map();
  private shadowTextureCache: Map<SpriteShadowSize, Texture> = new Map();
  private glowTextureCache: Map<string, Texture> = new Map();
  private ready: boolean = false;
  private pendingRender?: {
    state: GameState;
    isDead: boolean;
    callouts: readonly WorldCalloutView[];
  };
  private viewportElement?: HTMLElement;
  private scale: number = 1.0; // Configurable scale factor
  private cameraWorldX: number = 0; // Camera center (world px), smooth-followed
  private cameraWorldY: number = 0;
  private cameraMode: "player" | "map" = "player";
  private mapInteractionActive = false;
  private camLeftWorld: number = 0; // Window top-left (world px), after clamping
  private camTopWorld: number = 0;
  private lastRenderedPlayerHp?: number;
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

    // Drive WebGL directly instead of going through Application. Application
    // pulls in autoDetectRenderer (and with it the whole WebGPU backend) and
    // starts a second ticker that re-draws on its own RAF, out of phase with
    // the game loop. This game already owns its loop and only ever wants WebGL.
    this.pixi = new WebGLRenderer();
    this.stage = new Container();

    // Initialize containers
    this.mapContainer = new Container();
    this.entityContainer = new Container();
    this.entityContainer.sortableChildren = true;
    this.worldCalloutContainer = new Container();
    this.worldCalloutLayer = new WorldCalloutLayer(this.worldCalloutContainer);

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

    // Initialize the renderer
    await this.pixi.init({
      canvas,
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 0x4954aa,
      antialias: false, // Disable antialiasing for sharp pixels
      roundPixels: true, // Ensure pixel-perfect rendering
    });

    // Scale the stage to render at configured scale
    this.stage.scale.set(this.scale);

    // Add containers to stage
    this.stage.addChild(this.mapContainer);
    this.stage.addChild(this.entityContainer);
    this.stage.addChild(this.worldCalloutContainer);

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
        this.render(
          this.pendingRender.state,
          this.pendingRender.isDead,
          this.pendingRender.callouts,
        );
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
    this.stage.scale.set(this.scale);
    this.resizeToViewport();
  }

  /**
   * Feed the per-frame Matter Manipulator overlay (cursor highlight + mining
   * lightning). Pass null to clear it. Drawn during the next `render()`.
   */
  public setMatterManipulatorOverlay(
    overlay: MatterManipulatorOverlay | null,
  ): void {
    this.mmOverlay = overlay;
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
    if (this.pixi.width === width && this.pixi.height === height) {
      return;
    }
    this.pixi.resize(width, height);
  }

  /** The visible window size in world pixels (canvas pixels / zoom). */
  public getViewWorldSize(): { viewW: number; viewH: number } {
    if (!this.ready) {
      const { width, height } = this.computeViewportPixels();
      return {
        viewW: width / this.scale,
        viewH: height / this.scale,
      };
    }
    return {
      viewW: this.pixi.width / this.scale,
      viewH: this.pixi.height / this.scale,
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

  /** Temporarily move the gameplay camera to a point selected on the map. */
  public panCameraToWorld(worldX: number, worldY: number): void {
    this.cameraMode = "map";
    this.cameraWorldX = worldX;
    this.cameraWorldY = worldY;
  }

  /** Keep deliberate map dragging from being overridden by player movement. */
  public setMapInteractionActive(active: boolean): void {
    this.mapInteractionActive = active;
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

    return this.capturePlayerSnapshotFromRenderer(
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    );
  }

  /**
   * Fallback capture: re-renders the stage into a render texture.
   *
   * This deliberately does not read back the live WebGL canvas. Doing that
   * would need `preserveDrawingBuffer: true` on the renderer, which keeps the
   * drawing buffer alive between frames and costs on every frame of play, for
   * the sake of a path only ever taken when the sprite-sheet preview is
   * unavailable. `extract` re-renders on demand instead, so it works with the
   * buffer discarded as usual.
   */
  private capturePlayerSnapshotFromRenderer(
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ): string | null {
    try {
      const extractedCanvas = this.pixi.extract.canvas({
        target: this.stage,
        frame: new Rectangle(sourceX, sourceY, sourceWidth, sourceHeight),
        resolution: 1,
        clearColor: 0x05070a,
      });
      return this.canvasToPreviewDataUrl(extractedCanvas as HTMLCanvasElement);
    } catch {
      return null;
    }
  }

  private canvasToPreviewDataUrl(
    sourceCanvas: HTMLCanvasElement,
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
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
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
    const damage = getStateDamageAtIndex(state, tileIndex);
    const fixture = state.worldPlane.layers.fixture[tileIndex] as FixtureType;
    const structure = state.worldPlane.layers.structure[
      tileIndex
    ] as StructureType;
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
      const holeMask =
        state.worldPlane.visuals?.layers.holeMask[tileIndex] ??
        cardinalAutotileMask(
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
        structure === StructureType.WORKSHOP_FOOTPRINT
          ? SPRITE_COORDS[TileType.GRASS]
          : floorCoord,
        screenX,
        screenY,
        alpha,
        TileType.FLOOR,
      );
      tileCoord =
        fixture === FixtureType.CAVE_MOUTH
          ? SPRITE_COORDS.prototype_cave_mouth
          : structure === StructureType.WORKSHOP_FOOTPRINT
            ? null
            : state.levelKind === "outside" && tileType === TileType.STAIRS_DOWN
              ? SPRITE_COORDS.megacorp_entrance
              : SPRITE_COORDS[tileType];
    } else if (structure === StructureType.WORKSHOP) {
      baseCoord = SPRITE_COORDS[TileType.GRASS];
      tileCoord = SPRITE_COORDS.prototype_workshop;
    } else if (structure === StructureType.WORKSHOP_FOOTPRINT) {
      baseCoord = SPRITE_COORDS[TileType.GRASS];
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
      const wallMask =
        state.worldPlane.visuals?.layers.wallMask[tileIndex] ??
        cardinalAutotileMask(mapX, mapY, (x, y) => {
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
    } else if (tileType === TileType.BUILDING) {
      const part =
        state.worldPlane.visuals?.layers.buildingPart[tileIndex] ??
        (state.tiles.getTile(mapX, mapY + 1) === TileType.BUILDING
          ? ResolvedBuildingPart.ROOF
          : ResolvedBuildingPart.FACADE);
      tileCoord =
        part === ResolvedBuildingPart.ROOF
          ? SPRITE_COORDS.building_roof
          : SPRITE_COORDS[TileType.BUILDING];
    } else if (tileType === TileType.FENCE) {
      const orientation =
        state.worldPlane.visuals?.layers.fenceOrientation[tileIndex] ??
        (state.tiles.getTile(mapX, mapY - 1) === TileType.FENCE ||
        state.tiles.getTile(mapX, mapY + 1) === TileType.FENCE
          ? ResolvedFenceOrientation.VERTICAL
          : ResolvedFenceOrientation.HORIZONTAL);
      tileCoord =
        orientation === ResolvedFenceOrientation.VERTICAL
          ? SPRITE_COORDS.fence_vertical
          : SPRITE_COORDS.fence_horizontal;
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
        structure === StructureType.WORKSHOP
          ? "prototype_workshop"
          : tileType === TileType.WALL
            ? state.wallSet === "wood"
              ? "wall_wood"
              : TileType.WALL
            : fixture === FixtureType.CAVE_MOUTH
              ? "prototype_cave_mouth"
              : state.levelKind === "outside" &&
                  tileType === TileType.STAIRS_DOWN
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
   */
  public render(
    state: GameState,
    isDead: boolean = false,
    callouts: readonly WorldCalloutView[] = [],
  ): void {
    if (!this.ready) {
      // Store state to render once ready
      this.pendingRender = { state, isDead, callouts };
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
    this.stage.x =
      this.shakeIntensity > 0
        ? (Math.random() - 0.5) * this.shakeIntensity * this.scale
        : 0;
    this.stage.y =
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
      const playerWasHit =
        this.lastRenderedPlayerHp !== undefined &&
        player.hp < this.lastRenderedPlayerHp;
      const playerIsMoving = this.isEntityMoving(player);
      if (
        this.cameraMode === "map" &&
        !this.mapInteractionActive &&
        (playerWasHit || playerIsMoving)
      ) {
        this.cameraMode = "player";
        this.cameraWorldX = targetX;
        this.cameraWorldY = targetY;
      }

      if (this.cameraMode === "player" && state.sim.mode === "REALTIME") {
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
      } else if (this.cameraMode === "player") {
        // Planning mode: snap camera to the player.
        this.cameraWorldX = targetX;
        this.cameraWorldY = targetY;
      }
    }

    // Clear previous frame
    this.destroyFrameChildren(this.mapContainer);
    this.destroyFrameChildren(this.entityContainer);

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

    const worldVisualLayers = state.worldPlane.visuals?.layers;

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
        const coordinateHash =
          worldVisualLayers?.coordinateHash[tileIndex] ??
          hashWorldVisualCoordinate(mx, my, state.depth);
        const isRevealed = usingShadowFov ? explored.has(tileIndex) : true;
        const isVisible = usingShadowFov
          ? enhancedVision
            ? explored.has(tileIndex)
            : visible.has(tileIndex)
          : true;
        const tileType = state.tiles.getTile(mx, my);
        const productionGround = state.worldPlane.layers.ground[
          tileIndex
        ] as GroundType;
        const productionStructure = state.worldPlane.layers.structure[
          tileIndex
        ] as StructureType;
        const productionFixture = state.worldPlane.layers.fixture[
          tileIndex
        ] as FixtureType;
        const isProductionWater =
          productionGround === GroundType.WATER_SHALLOW ||
          productionGround === GroundType.WATER_DEEP ||
          productionGround === GroundType.WATER_RIVER;

        if (!isRevealed) continue;

        const screenX = offsetX + tileX * CELL_CONFIG.w;
        const screenY = offsetY + tileY * CELL_CONFIG.h;
        const tileBaselineX = screenX + CELL_CONFIG.w / 2;
        const tileBaselineY = screenY + CELL_CONFIG.h;
        const tileSortY = tileY * CELL_CONFIG.h + CELL_CONFIG.h;

        const floorVariant = state.floorVariant ?? 0;
        const floorCoord =
          FLOOR_VARIANTS[floorVariant] || SPRITE_COORDS[TileType.FLOOR];
        const damage = getStateDamageAtIndex(state, tileIndex);

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

        const prototype = state.terrainPrototype;
        if (prototype) {
          const prototypeIndex = mx + my * prototype.width;
          const groundKeyByVisual: Record<PrototypeGroundVisual, string> = {
            [PrototypeGroundVisual.GRASS]: "prototype_grass",
            [PrototypeGroundVisual.GRASS_ALT]: "prototype_grass_alt",
            [PrototypeGroundVisual.GRASS_FLOWERS]: "prototype_grass_flowers",
            [PrototypeGroundVisual.DIRT]: "prototype_dirt",
            [PrototypeGroundVisual.DIRT_ALT]: "prototype_dirt_alt",
            [PrototypeGroundVisual.STONE]: "prototype_stone",
            [PrototypeGroundVisual.STONE_ALT]: "prototype_stone_alt",
            [PrototypeGroundVisual.WATER_SHALLOW]: "prototype_water_shallow",
            [PrototypeGroundVisual.WATER_SHALLOW_ALT]: "prototype_water_alt",
            [PrototypeGroundVisual.WATER_DEEP]: "prototype_water_deep",
          };
          renderGround(
            groundKeyByVisual[
              prototype.visuals.ground[prototypeIndex] as PrototypeGroundVisual
            ],
          );

          // A lower cell directly south of a higher terrace carries the visible
          // face. Arbitrary height differences collapse to one bounded sprite.
          const cliffVisual = prototype.visuals.cliff[
            prototypeIndex
          ] as PrototypeCliffVisual;
          const cliffEdgeMask = prototype.visuals.cliffEdgeMask[prototypeIndex];
          if (cliffVisual !== PrototypeCliffVisual.NONE) {
            renderGround(
              cliffVisual === PrototypeCliffVisual.TALL
                ? "prototype_cliff_tall"
                : "prototype_cliff_step",
            );
          } else {
            if (cliffEdgeMask & ELEVATION_NORTH) {
              renderGround("prototype_cliff_edge_north");
            }
            if (cliffEdgeMask & ELEVATION_EAST) {
              renderGround("prototype_cliff_edge_east");
            }
            if (cliffEdgeMask & ELEVATION_SOUTH) {
              renderGround("prototype_cliff_edge_south");
            }
            if (cliffEdgeMask & ELEVATION_WEST) {
              renderGround("prototype_cliff_edge_west");
            }
          }

          const prototypeStructure = prototype.structure[prototypeIndex];
          if (prototypeStructure === PrototypeStructure.TREE) {
            renderDecoration("prototype_tree");
          } else if (
            prototypeStructure === PrototypeStructure.BRIDGE_HORIZONTAL
          ) {
            renderGround("prototype_bridge_horizontal");
          } else if (prototypeStructure === PrototypeStructure.STAIRS) {
            renderGround("prototype_stairs");
          } else if (prototypeStructure === PrototypeStructure.GARDEN) {
            renderGround("prototype_garden");
          } else if (prototypeStructure === PrototypeStructure.FLOWERS) {
            renderDecoration("prototype_flowers");
          } else if (prototypeStructure === PrototypeStructure.CRATE) {
            renderDecoration("crate");
          } else if (prototypeStructure === PrototypeStructure.WORKSHOP) {
            renderDecoration("prototype_workshop");
          } else if (prototypeStructure === PrototypeStructure.CAVE_MOUTH) {
            renderDecoration("prototype_cave_mouth");
          }
          const isDirty =
            prototype.editFeedback.dirtyCellIndices.has(prototypeIndex);
          if (isDirty) {
            const isEdited =
              prototype.editFeedback.editedCellIndex === prototypeIndex;
            const fixtureColor = 0x5de2c2;
            const highlight = new Graphics();
            highlight
              .rect(screenX, screenY, CELL_CONFIG.w, CELL_CONFIG.h)
              .fill({
                color: isEdited ? 0xffd166 : fixtureColor,
                alpha: isDirty ? 0.16 : 0.06,
              })
              .stroke({
                color: isEdited ? 0xfff1a8 : fixtureColor,
                width: isEdited ? 2 : 1,
                alpha: isEdited ? 0.95 : isDirty ? 0.5 : 0.8,
              });
            highlight.zIndex = tileSortY + 0.5;
            this.entityContainer.addChild(highlight);
          }
          continue;
        }

        if (isProductionWater) {
          renderGround(
            productionGround === GroundType.WATER_DEEP
              ? "prototype_water_deep"
              : mixWorldVisualHash(coordinateHash, 31) % 5 === 0
                ? "prototype_water_alt"
                : "prototype_water_shallow",
          );
          if (productionStructure === StructureType.BRIDGE_HORIZONTAL) {
            renderGround("prototype_bridge_horizontal");
          } else if (productionGround === GroundType.WATER_RIVER) {
            const riverMask = worldVisualLayers?.riverMask[tileIndex] ?? 0;
            const flow = new Graphics();
            if ((riverMask & 5) !== 0) {
              flow.rect(screenX + 14, screenY + 5, 3, 22);
            } else {
              flow.rect(screenX + 5, screenY + 14, 22, 3);
            }
            flow.fill({ color: 0xb8f3cf, alpha: isVisible ? 0.45 : 0.14 });
            flow.zIndex = tileSortY + 0.05;
            this.entityContainer.addChild(flow);
          }
        } else if (tileType === TileType.FLOOR) {
          renderGround(TileType.FLOOR, floorCoord);
          if (damage >= FLOOR_DAMAGE_THRESHOLDS[0]) {
            renderGround("floor_damaged");
          }
        } else if (tileType === TileType.HOLE) {
          renderGround(TileType.FLOOR, floorCoord);
          const holeMask =
            worldVisualLayers?.holeMask[tileIndex] ??
            cardinalAutotileMask(
              tileX,
              tileY,
              (x, y) => tileAtWindow(x, y) === TileType.HOLE,
            );
          renderGround("hole", holeAutotileCoordinate(holeMask));
        } else if (tileType === TileType.GRASS) {
          renderGround(
            mixWorldVisualHash(coordinateHash, 3) % 17 === 0
              ? "grass_flowers"
              : TileType.GRASS,
          );
          renderDepthTile("grass_blades");
        } else if (tileType === TileType.WEEDS) {
          renderGround(
            mixWorldVisualHash(coordinateHash, 4) % 4 === 0
              ? "weeds_dense"
              : TileType.WEEDS,
          );
          renderDepthTile("weeds_blades");
        } else if (tileType === TileType.ASPHALT) {
          renderGround(
            mixWorldVisualHash(coordinateHash, 5) % 9 === 0
              ? "asphalt_cracked"
              : TileType.ASPHALT,
          );
        } else if (tileType === TileType.SIDEWALK) {
          renderGround(
            mixWorldVisualHash(coordinateHash, 6) % 7 === 0
              ? "sidewalk_cracked"
              : TileType.SIDEWALK,
          );
        } else if (tileType === TileType.LIGHT) {
          // A streetlight fixture: a paved base, the lamppost, and a warm glow.
          renderGround(TileType.SIDEWALK);
          renderDecoration("streetlight", 1, {
            color: "rgba(255, 214, 112, 0.32)",
            scale: 0.95,
          });
        } else if (
          tileType === TileType.DOOR_CLOSED ||
          tileType === TileType.DOOR_OPEN ||
          tileType === TileType.DOOR_LOCKED ||
          tileType === TileType.STAIRS_DOWN ||
          tileType === TileType.STAIRS_UP
        ) {
          if (productionStructure === StructureType.WORKSHOP_FOOTPRINT) {
            renderGround(TileType.GRASS);
          } else {
            renderGround(TileType.FLOOR, floorCoord);
          }
          if (productionFixture === FixtureType.CAVE_MOUTH) {
            renderDepthTile("prototype_cave_mouth");
          } else if (productionStructure === StructureType.WORKSHOP_FOOTPRINT) {
            // The workshop billboard already contains its visible doorway.
          } else if (
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
        } else if (productionStructure === StructureType.WORKSHOP) {
          renderGround(TileType.GRASS);
          renderDepthTile("prototype_workshop");
        } else if (productionStructure === StructureType.WORKSHOP_FOOTPRINT) {
          renderGround(TileType.GRASS);
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
          const wallMask =
            worldVisualLayers?.wallMask[tileIndex] ??
            cardinalAutotileMask(tileX, tileY, (x, y) => {
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
        } else if (tileType === TileType.HOLOWALL) {
          renderGround(TileType.FLOOR, floorCoord);
          renderDepthTile(TileType.HOLOWALL);
        } else if (
          tileType === TileType.TREE ||
          tileType === TileType.BUILDING ||
          tileType === TileType.FENCE ||
          tileType === TileType.RUBBLE
        ) {
          if (tileType === TileType.BUILDING) {
            const part =
              worldVisualLayers?.buildingPart[tileIndex] ??
              (tileAtWindow(tileX, tileY + 1) === TileType.BUILDING
                ? ResolvedBuildingPart.ROOF
                : ResolvedBuildingPart.FACADE);
            if (part === ResolvedBuildingPart.ROOF) {
              renderGround("building_roof");
            } else {
              renderDepthTile(TileType.BUILDING);
            }
          } else if (tileType === TileType.FENCE) {
            const orientation =
              worldVisualLayers?.fenceOrientation[tileIndex] ??
              (tileAtWindow(tileX, tileY - 1) === TileType.FENCE ||
              tileAtWindow(tileX, tileY + 1) === TileType.FENCE
                ? ResolvedFenceOrientation.VERTICAL
                : ResolvedFenceOrientation.HORIZONTAL);
            renderDepthTile(
              orientation === ResolvedFenceOrientation.VERTICAL
                ? "fence_vertical"
                : "fence_horizontal",
            );
          } else {
            renderDepthTile(tileType);
          }
        } else {
          renderGround(tileType);
        }

        if (productionFixture === FixtureType.STAIRS && !isProductionWater) {
          renderGround("prototype_stairs");
        } else if (productionFixture === FixtureType.GARDEN) {
          renderGround("prototype_garden");
        } else if (productionFixture === FixtureType.CRATE) {
          renderDepthTile("crate");
        } else if (productionFixture === FixtureType.FLOWERS) {
          renderDepthTile("prototype_flowers");
        }

        if (
          isProductionWater &&
          productionStructure !== StructureType.BRIDGE_HORIZONTAL
        ) {
          const mask = worldVisualLayers?.shoreMask[tileIndex] ?? 0;
          const shore = new Graphics();
          if (!(mask & TRANSITION_NORTH)) shore.rect(screenX, screenY, 32, 4);
          if (!(mask & TRANSITION_EAST))
            shore.rect(screenX + 28, screenY, 4, 32);
          if (!(mask & TRANSITION_SOUTH))
            shore.rect(screenX, screenY + 28, 32, 4);
          if (!(mask & TRANSITION_WEST)) shore.rect(screenX, screenY, 4, 32);
          shore.fill({
            color:
              productionGround === GroundType.WATER_DEEP ? 0x5de2d1 : 0xb8f3cf,
            alpha: isVisible ? 0.9 : 0.28,
          });
          shore.zIndex = tileSortY + 0.1;
          this.entityContainer.addChild(shore);
        }

        const lowerMask = worldVisualLayers?.lowerElevationMask[tileIndex] ?? 0;
        if (lowerMask !== 0) {
          const magnitude = worldVisualLayers?.cliffMagnitude[tileIndex] ?? 0;
          const cliff = new Graphics();
          const faceDepth = magnitude === ResolvedCliffMagnitude.TALL ? 12 : 7;
          if (lowerMask & ELEVATION_NORTH) cliff.rect(screenX, screenY, 32, 3);
          if (lowerMask & ELEVATION_EAST)
            cliff.rect(screenX + 29, screenY, 3, 32);
          if (lowerMask & ELEVATION_SOUTH)
            cliff.rect(screenX, screenY + 32 - faceDepth, 32, faceDepth);
          if (lowerMask & ELEVATION_WEST) cliff.rect(screenX, screenY, 3, 32);
          cliff.fill({
            color:
              magnitude === ResolvedCliffMagnitude.TALL ? 0x6c4f62 : 0x9a6b57,
            alpha: isVisible ? 0.95 : 0.32,
          });
          cliff
            .rect(screenX + 2, screenY + 29 - faceDepth, 28, 2)
            .fill({ color: 0xd48b62, alpha: isVisible ? 0.8 : 0.25 });
          cliff.zIndex = tileSortY + 0.2;
          this.entityContainer.addChild(cliff);
        }
      }
    }

    // Development-only shoreline comparison. Both candidates consume the same
    // cached semantic water field; only their display lattice and art burden
    // differ. Keeping this pass separate prevents presentation from leaking
    // back into authoritative ground IDs.
    const terrainPrototype = state.terrainPrototype;
    if (terrainPrototype) {
      for (let tileY = startRow; tileY <= endRow; tileY++) {
        for (let tileX = startCol; tileX <= endCol; tileX++) {
          if (
            tileX < 0 ||
            tileY < 0 ||
            tileX >= terrainPrototype.width ||
            tileY >= terrainPrototype.height
          ) {
            continue;
          }
          const index = tileX + tileY * terrainPrototype.width;
          const mask = terrainPrototype.visuals.shoreMask[index];
          const screenX = offsetX + tileX * CELL_CONFIG.w;
          const screenY = offsetY + tileY * CELL_CONFIG.h;

          if (
            terrainPrototype.transitionMode ===
            TerrainPrototypeTransitionMode.DUAL_GRID
          ) {
            if (mask === 0 || mask === 15) continue;
            const bridgeAt = (x: number, y: number): boolean =>
              x >= 0 &&
              y >= 0 &&
              x < terrainPrototype.width &&
              y < terrainPrototype.height &&
              terrainPrototype.structure[x + y * terrainPrototype.width] ===
                PrototypeStructure.BRIDGE_HORIZONTAL;
            if (
              bridgeAt(tileX - 1, tileY - 1) ||
              bridgeAt(tileX, tileY - 1) ||
              bridgeAt(tileX, tileY) ||
              bridgeAt(tileX - 1, tileY)
            ) {
              continue;
            }
            const transition = new Graphics();
            const drawQuadrant = (bit: number, x: number, y: number): void => {
              if (!(mask & bit)) return;
              transition.rect(screenX - 16 + x, screenY - 16 + y, 16, 16);
            };
            drawQuadrant(DUAL_GRID_NORTH_WEST, 0, 0);
            drawQuadrant(DUAL_GRID_NORTH_EAST, 16, 0);
            drawQuadrant(DUAL_GRID_SOUTH_EAST, 16, 16);
            drawQuadrant(DUAL_GRID_SOUTH_WEST, 0, 16);
            transition.fill({ color: 0x1fb8b4, alpha: 0.92 });
            transition
              .rect(screenX - 13, screenY - 13, 6, 2)
              .rect(screenX + 5, screenY + 9, 8, 2)
              .fill({ color: 0x86e7df, alpha: 0.7 });
            this.mapContainer.addChild(transition);
            continue;
          }

          const ground = terrainPrototype.ground[index] as PrototypeGround;
          const isWater =
            ground === PrototypeGround.WATER_SHALLOW ||
            ground === PrototypeGround.WATER_DEEP;
          if (
            !isWater ||
            terrainPrototype.structure[index] ===
              PrototypeStructure.BRIDGE_HORIZONTAL
          ) {
            continue;
          }
          const shore = new Graphics();
          if (!(mask & TRANSITION_NORTH)) {
            shore.rect(screenX, screenY, 32, 4);
          }
          if (!(mask & TRANSITION_EAST)) {
            shore.rect(screenX + 28, screenY, 4, 32);
          }
          if (!(mask & TRANSITION_SOUTH)) {
            shore.rect(screenX, screenY + 28, 32, 4);
          }
          if (!(mask & TRANSITION_WEST)) {
            shore.rect(screenX, screenY, 4, 32);
          }
          shore.fill({ color: 0x86e7df, alpha: 0.95 });
          if (
            mask & TRANSITION_NORTH &&
            mask & TRANSITION_EAST &&
            !(mask & TRANSITION_NORTH_EAST)
          ) {
            shore.rect(screenX + 25, screenY, 7, 7);
          }
          if (
            mask & TRANSITION_EAST &&
            mask & TRANSITION_SOUTH &&
            !(mask & TRANSITION_SOUTH_EAST)
          ) {
            shore.rect(screenX + 25, screenY + 25, 7, 7);
          }
          if (
            mask & TRANSITION_SOUTH &&
            mask & TRANSITION_WEST &&
            !(mask & TRANSITION_SOUTH_WEST)
          ) {
            shore.rect(screenX, screenY + 25, 7, 7);
          }
          if (
            mask & TRANSITION_WEST &&
            mask & TRANSITION_NORTH &&
            !(mask & TRANSITION_NORTH_WEST)
          ) {
            shore.rect(screenX, screenY, 7, 7);
          }
          shore.fill({ color: 0x5de2d1, alpha: 0.9 });
          this.mapContainer.addChild(shore);
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

    // Signs are sparse world fixtures rather than entities: they share the
    // world visibility rules but never participate in collision or depth
    // simulation. One generic board/post treatment keeps their content fully
    // data-driven while making them discoverable in authored scenes.
    for (const sign of state.signs) {
      const tileIndex = sign.x + sign.y * state.mapWidth;
      const isRevealed = usingShadowFov ? explored.has(tileIndex) : true;
      const isVisible = usingShadowFov
        ? enhancedVision
          ? explored.has(tileIndex)
          : visible.has(tileIndex)
        : true;
      if (!isRevealed) continue;

      const worldX = this.wrapImage(
        sign.x * CELL_CONFIG.w + CELL_CONFIG.w / 2,
        camCenterX,
        worldW,
        wraps,
      );
      const worldY = this.wrapImage(
        sign.y * CELL_CONFIG.h + CELL_CONFIG.h / 2,
        camCenterY,
        worldH,
        wraps,
      );
      const screenX = offsetX + worldX;
      const screenY = offsetY + worldY;
      if (
        screenX < -CELL_CONFIG.w ||
        screenY < -CELL_CONFIG.h * 2 ||
        screenX > viewW + CELL_CONFIG.w ||
        screenY > viewH + CELL_CONFIG.h
      ) {
        continue;
      }

      const alpha = !isVisible && usingShadowFov ? 0.45 : 1;
      const graphic = new Graphics();
      graphic
        .rect(screenX - 11, screenY - 24, 22, 14)
        .fill({ color: 0xf3ca73, alpha })
        .stroke({ color: 0x6e4838, width: 2, alpha });
      graphic.rect(screenX - 1, screenY - 10, 2, 11).fill({
        color: 0xc77b4f,
        alpha,
      });
      graphic.rect(screenX - 6, screenY - 20, 12, 2).fill({
        color: 0x6e4838,
        alpha: alpha * 0.7,
      });
      graphic.zIndex = worldY + CELL_CONFIG.h / 2;
      this.entityContainer.addChild(graphic);
    }

    const playerFrameKey = (
      moving: boolean,
      facing: FacingDirection,
      dead: boolean,
      offsetMs: number = 0,
    ): string => {
      if (dead) return "player_dead";
      // These are distinct directional drawings rather than compatible walk
      // poses, so select one stable frame instead of animating between them.
      if (facing === "left") return "player_walk_side_2";
      if (facing === "right") return "player_walk_side_1";
      if (!moving) {
        if (facing === "down") return "player_walk_down_1";
        if (facing === "up") return "player_walk_up_1";
      }
      const frameIndex = this.getWalkFrameIndex(nowMs, 2, 160, offsetMs) + 1;
      if (facing === "down") return `player_walk_down_${frameIndex}`;
      if (facing === "up") return `player_walk_up_${frameIndex}`;
      return facing === "left" ? "player_walk_side_2" : "player_walk_side_1";
    };

    const renderLaserPath = (
      points: BeamPoint[],
      beamAlpha: number,
      zIndex: number,
    ): void => {
      if (points.length < 2) return;
      const drawPath = (graphics: Graphics): void => {
        const first = points[0];
        graphics.moveTo(
          offsetX + this.wrapImage(first.x, camCenterX, worldW, wraps),
          offsetY + this.wrapImage(first.y, camCenterY, worldH, wraps),
        );
        for (let i = 1; i < points.length; i++) {
          const point = points[i];
          graphics.lineTo(
            offsetX + this.wrapImage(point.x, camCenterX, worldW, wraps),
            offsetY + this.wrapImage(point.y, camCenterY, worldH, wraps),
          );
        }
      };

      const glow = new Graphics();
      drawPath(glow);
      glow.stroke({ color: 0x22d3ff, width: 8, alpha: beamAlpha * 0.24 });
      glow.zIndex = zIndex;
      this.entityContainer.addChild(glow);

      const beam = new Graphics();
      drawPath(beam);
      beam.stroke({ color: 0x63f4ff, width: 3, alpha: beamAlpha });
      beam.zIndex = zIndex + 0.1;
      this.entityContainer.addChild(beam);

      const core = new Graphics();
      drawPath(core);
      core.stroke({ color: 0xffffff, width: 1, alpha: beamAlpha });
      core.zIndex = zIndex + 0.2;
      this.entityContainer.addChild(core);
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
        const projectile = entity as {
          projectileType?: "bullet" | "laser";
          trailPoints?: BeamPoint[];
          thrownItem?: ItemType;
          worldX: number;
          worldY: number;
        };
        if (projectile.projectileType === "laser") {
          renderLaserPath(
            [
              ...(projectile.trailPoints ?? []),
              { x: projectile.worldX, y: projectile.worldY },
            ],
            1,
            sortY + 14,
          );
          return;
        }
        const thrown = projectile.thrownItem;
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
      } else if (
        entity.kind === EntityKind.MONSTER &&
        (entity as any).type === MonsterType.CYBERCOP
      ) {
        sprite.alpha = 0.22;
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

      if (effect.type === "laser_beam") {
        renderLaserPath(
          effect.beamPoints ?? [],
          Math.max(0, 1 - effect.ageTicks / effect.durationTicks),
          sortY + 14,
        );
      } else if (effect.type === "explosion") {
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
          sprite.alpha = 1 - effect.ageTicks / effect.durationTicks;
          sprite.zIndex = sortY + 12;
          this.entityContainer.addChild(sprite);
        }
      }
    }

    // Matter Manipulator overlay: hover highlight (in-range only) + mining
    // lightning. Client-only; drawn above tiles/entities.
    if (this.mmOverlay?.active) {
      const tileTopLeftScreen = (tx: number, ty: number) => {
        const cx = tx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
        const cy = ty * CELL_CONFIG.h + CELL_CONFIG.h / 2;
        return {
          sx:
            offsetX +
            this.wrapImage(cx, camCenterX, worldW, wraps) -
            CELL_CONFIG.w / 2,
          sy:
            offsetY +
            this.wrapImage(cy, camCenterY, worldH, wraps) -
            CELL_CONFIG.h / 2,
        };
      };

      if (this.mmOverlay.hasCursorTile && this.mmOverlay.inRange) {
        const { sx, sy } = tileTopLeftScreen(
          this.mmOverlay.cursorTileX,
          this.mmOverlay.cursorTileY,
        );
        const pulse = 0.22 + 0.14 * Math.sin(nowMs / 150);
        const hi = new Graphics();
        hi.rect(sx, sy, CELL_CONFIG.w, CELL_CONFIG.h)
          .fill({ color: 0x00e7ee, alpha: pulse })
          .stroke({ color: 0x9ffcff, width: 2, alpha: 0.9 });
        hi.zIndex = 1_000_000;
        this.entityContainer.addChild(hi);
      }

      for (const zap of this.mmOverlay.zapTiles) {
        const { sx, sy } = tileTopLeftScreen(zap.tileX, zap.tileY);
        const bolt = this.buildLightning(sx, sy, nowMs);
        bolt.zIndex = 1_000_001;
        this.entityContainer.addChild(bolt);
      }
    }

    const playerMoving = this.isEntityMoving(player);
    if (playerMoving) {
      this.playerFacing = this.getEntityDirection(player);
    }
    renderDepthEntity(player, isDead);

    const anchoredCallouts: AnchoredWorldCallout[] = [];
    for (const callout of callouts) {
      const speakerId = callout.callout.speakerId;
      const speaker = speakerId
        ? state.entityManager.getById(speakerId)
        : undefined;
      let anchorX: number;
      let anchorY: number;
      let gridX: number;
      let gridY: number;

      if (speaker) {
        const position = getEntityScreenPosition(speaker);
        anchorX = position.screenX;
        anchorY = position.screenY - CELL_CONFIG.h / 2;
        gridX = speaker.gridX;
        gridY = speaker.gridY;
      } else {
        const anchorWorldX = this.wrapImage(
          callout.callout.worldX,
          camCenterX,
          worldW,
          wraps,
        );
        const anchorWorldY = this.wrapImage(
          callout.callout.worldY,
          camCenterY,
          worldH,
          wraps,
        );
        anchorX = offsetX + anchorWorldX;
        anchorY = offsetY + anchorWorldY - CELL_CONFIG.h / 2;
        gridX = Math.floor(callout.callout.worldX / CELL_CONFIG.w);
        gridY = Math.floor(callout.callout.worldY / CELL_CONFIG.h);
      }

      if (wraps) {
        gridX = wrapValue(gridX, state.mapWidth);
        gridY = wrapValue(gridY, state.mapHeight);
      }
      if (
        gridX < 0 ||
        gridY < 0 ||
        gridX >= state.mapWidth ||
        gridY >= state.mapHeight
      ) {
        continue;
      }
      const tileIndex = gridX + gridY * state.mapWidth;
      const visibleToPlayer = usingShadowFov
        ? enhancedVision
          ? explored.has(tileIndex)
          : visible.has(tileIndex)
        : true;
      if (!visibleToPlayer) continue;

      anchoredCallouts.push({ ...callout, anchorX, anchorY });
    }
    this.worldCalloutLayer.render(anchoredCallouts, viewW, viewH);
    this.lastRenderedPlayerHp = player.hp;

    // The scene graph is now current for this frame — draw it. Application's
    // ticker used to do this on its own RAF; doing it here means exactly one
    // draw per game frame, of a fully updated scene.
    this.pixi.render(this.stage);
  }

  /**
   * A crackling electric bolt drawn across a tile — a few jagged polylines that
   * re-randomize each frame so the effect flickers like arcing electricity.
   */
  private buildLightning(sx: number, sy: number, nowMs: number): Graphics {
    const g = new Graphics();
    const w = CELL_CONFIG.w;
    const h = CELL_CONFIG.h;
    const cx = sx + w / 2;
    const cy = sy + h / 2;
    const boltCount = 3;
    const segments = 4;
    const jitter = 5;

    // Precompute the jagged points so the glow and core strokes trace the same
    // path (they'd diverge if we re-rolled the random jitter for each stroke).
    const bolts: { x: number; y: number }[][] = [];
    for (let b = 0; b < boltCount; b++) {
      const angle = (b / boltCount) * Math.PI * 2 + nowMs / 90;
      const startX = cx + Math.cos(angle) * (w / 2);
      const startY = cy + Math.sin(angle) * (h / 2);
      const endX = cx - Math.cos(angle) * (w / 2);
      const endY = cy - Math.sin(angle) * (h / 2);
      const pts = [{ x: startX, y: startY }];
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        pts.push({
          x: startX + (endX - startX) * t + (Math.random() - 0.5) * jitter * 2,
          y: startY + (endY - startY) * t + (Math.random() - 0.5) * jitter * 2,
        });
      }
      pts.push({ x: endX, y: endY });
      bolts.push(pts);
    }

    const tracePath = (): void => {
      for (const pts of bolts) {
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      }
    };

    // Wide translucent glow underlay, then a bright thin core.
    tracePath();
    g.stroke({ color: 0x00e7ee, width: 3, alpha: 0.5 });
    tracePath();
    g.stroke({ color: 0xd8ffff, width: 1.25, alpha: 0.95 });
    return g;
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

    this.cameraMode = "player";
    if (!smooth) {
      // Hard snap (level change / respawn) so the camera doesn't sweep.
      this.cameraWorldX = playerWorldX;
      this.cameraWorldY = playerWorldY;
    }
  }

  /** Release transient display objects allocated for the previous frame. */
  private destroyFrameChildren(container: Container): void {
    const children = container.removeChildren();
    for (const child of children) {
      child.destroy({ children: true, context: true });
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
