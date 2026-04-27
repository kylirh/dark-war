import { Game } from "./core/Game";
import { GameLoop } from "./core/GameLoop";
import { GameEntity } from "./entities/GameEntity";
import { InputCallbacks, InputHandler, MOVEMENT_SPEED } from "./systems/Input";
import { MouseTracker } from "./systems/MouseTracker";
import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import {
  enqueueCommand,
  SIM_DT_MS,
  stepSimulationTick,
} from "./systems/Simulation";
import { Sound, SoundEffect } from "./systems/Sound";
import { UI } from "./systems/UI";
import {
  CELL_CONFIG,
  CommandData,
  CommandType,
  EntityKind,
  MAP_WIDTH,
  MultiplayerMode,
  REAL_TIME_SPEED,
  SLOWMO_SCALE,
  TileType,
  TIME_SCALE_TRANSITION_SPEED,
  WeaponType,
} from "./types";
import { idx, inBounds } from "./utils/helpers";
import {
  MultiplayerConfig,
  getMultiplayerConfigFromUrl,
} from "./utils/multiplayer";
import { findPathToClosestReachable } from "./utils/pathfinding";
import { MultiplayerClient, NetworkAction } from "./net/MultiplayerClient";

/**
 * Dark War - Main Entry Point
 *
 * Modern roguelike remake of Mission Thunderbolt (1992)
 * Features:
 * - Continuous fluid movement with physics-based collision
 * - Superhot-style time mechanics (time flows when you move)
 * - Grid-based destructible terrain (future)
 * - Mouse aiming and shooting
 *
 * Architecture:
 * - 60Hz fixed timestep physics via GameLoop
 * - Event-driven simulation system
 * - Entity-Component pattern with continuous coordinates
 */

/** Enable debug logging for the entire game */
const DEBUG = false;

/** The delay between clicks to count as double-click */
const DOUBLE_CLICK_DELAY_MS = 320;

/** Delay before the initial or reset camera recenter runs. */
const INITIAL_CAMERA_CENTER_DELAY_MS = 100;

/** Delay before recentering after a level transition. */
const LEVEL_TRANSITION_CAMERA_DELAY_MS = 50;

/** Minimum delay between repeated online-unavailable log messages. */
const ONLINE_ACTION_UNAVAILABLE_LOG_THROTTLE_MS = 1000;

/** The minimum accumulated deltaY to trigger the scroll wheel. Tunes the scroll wheel's sensitivity. */
const SCROLL_WHEEL_DELTA_THRESHOLD = 50; // Minimum accumulated deltaY to trigger the scroll wheel. Tunes the scroll wheel's sensitivity.

/** The delay between allowed scroll wheel changes. Tunes the scroll wheel's sensitivity. */
const SCROLL_WHEEL_THROTTLE_MS = 200; //

// Global reference to save system
declare global {
  interface Window {
    native?: {
      saveWrite: (data: string) => Promise<{ ok: boolean; error?: string }>;
      saveRead: () => Promise<{ ok: boolean; data?: string; error?: string }>;
      onNewGame: (callback: () => void) => void;
      onSaveGame: (callback: () => void) => void;
      onLoadGame: (callback: () => void) => void;
    };
    darkWarApp?: DarkWar;
  }
}

/**
 * The main game application
 */
class DarkWar {
  private game: Game;
  private gameLoop: GameLoop;
  private physics: Physics;
  private mouseTracker: MouseTracker;
  private renderer: Renderer;
  private ui: UI;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private inputHandler: InputHandler;
  private playerActedThisTick: boolean = false;
  private autoMovePath: [number, number][] | null = null;
  private autoMoveDoorTarget: { gridX: number; gridY: number } | null = null;
  private autoMovePickupTarget: { gridX: number; gridY: number } | null = null;
  private autoMoveHoleTarget: { gridX: number; gridY: number } | null = null;
  private autoMoveStairsTarget: {
    gridX: number;
    gridY: number;
    direction: "up" | "down";
  } | null = null;
  private realTimeToggled: boolean = false; // Track if Enter key toggled real-time mode
  private wasPlayerMoving: boolean = false;
  private lastPlayerWorldX?: number;
  private lastPlayerWorldY?: number;
  private lastWheelTime: number = 0; // Track last weapon cycle time
  private wheelDeltaAccumulator: number = 0; // Accumulate wheel delta
  private lastPlayerHp?: number;
  private lastRightClickTime: number = 0;
  private lastRightClickTile: { gridX: number; gridY: number } | null = null;
  private pendingRightClickTimer: number | null = null;
  private pendingRightClickTile: { gridX: number; gridY: number } | null = null;
  private multiplayerMode: MultiplayerMode;
  private multiplayerConfig: MultiplayerConfig;
  private multiplayerClient: MultiplayerClient | null = null;
  private onlineConnected: boolean = false;
  private gameCanvas: HTMLCanvasElement | null = null;
  private newGameButton: HTMLElement | null = null;
  private lastOnlineUnavailableLogAt: number = 0;
  private readonly onCanvasClick = (): void => {
    this.handleMouseFire();
  };
  private readonly onCanvasContextMenu = (event: MouseEvent): void => {
    event.preventDefault();

    const canvas = this.gameCanvas;
    if (!canvas) {
      return;
    }

    const scale = this.renderer.getScale();
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const gameX = canvasX / scale;
    const gameY = canvasY / scale;
    const tileX = Math.floor((gameX - CELL_CONFIG.padX) / CELL_CONFIG.w);
    const tileY = Math.floor((gameY - CELL_CONFIG.padY) / CELL_CONFIG.h);

    if (!inBounds(tileX, tileY)) {
      return;
    }

    const now = performance.now();
    const isSameTileAsLastClick =
      this.lastRightClickTile &&
      this.lastRightClickTile.gridX === tileX &&
      this.lastRightClickTile.gridY === tileY;
    const isDoubleRightClick =
      isSameTileAsLastClick &&
      now - this.lastRightClickTime <= DOUBLE_CLICK_DELAY_MS;
    this.lastRightClickTime = now;
    this.lastRightClickTile = { gridX: tileX, gridY: tileY };

    if (this.pendingRightClickTimer !== null) {
      window.clearTimeout(this.pendingRightClickTimer);
      this.pendingRightClickTimer = null;
      this.pendingRightClickTile = null;
    }

    if (isDoubleRightClick) {
      this.triggerRightClickMove(tileX, tileY, true);
      return;
    }

    this.pendingRightClickTile = { gridX: tileX, gridY: tileY };
    this.pendingRightClickTimer = window.setTimeout(() => {
      const pendingTile = this.pendingRightClickTile;
      this.pendingRightClickTimer = null;
      this.pendingRightClickTile = null;
      if (!pendingTile) return;
      this.triggerRightClickMove(pendingTile.gridX, pendingTile.gridY, false);
    }, DOUBLE_CLICK_DELAY_MS);
  };
  private readonly onCanvasWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const now = performance.now();
    const timeSinceLastSwitch = now - this.lastWheelTime;

    this.wheelDeltaAccumulator += event.deltaY;

    if (
      timeSinceLastSwitch >= SCROLL_WHEEL_THROTTLE_MS &&
      Math.abs(this.wheelDeltaAccumulator) >= SCROLL_WHEEL_DELTA_THRESHOLD
    ) {
      const direction = this.wheelDeltaAccumulator > 0 ? 1 : -1;
      this.handleCycleWeapon(direction);
      this.lastWheelTime = now;
      this.wheelDeltaAccumulator = 0;
    }
  };
  private readonly onNewGameButtonClick = (): void => {
    this.handleNewGame();
  };

  constructor() {
    if (DEBUG) console.time("Game initialization");
    if (DEBUG) console.time("Create Game instance");
    this.multiplayerConfig = getMultiplayerConfigFromUrl();
    this.multiplayerMode = this.multiplayerConfig.mode;
    this.game = new Game({ mode: this.multiplayerMode });
    if (DEBUG) console.timeEnd("Create Game instance");

    if (DEBUG) console.time("Create Physics");
    this.physics = new Physics();
    if (DEBUG) console.timeEnd("Create Physics");

    if (DEBUG) console.time("Create MouseTracker");
    this.mouseTracker = new MouseTracker("game");
    if (DEBUG) console.timeEnd("Create MouseTracker");

    if (DEBUG) console.time("Create Renderer");
    this.renderer = new Renderer("game");
    if (DEBUG) console.timeEnd("Create Renderer");

    if (DEBUG) console.time("Create UI");
    this.ui = new UI();
    if (DEBUG) console.timeEnd("Create UI");

    if (DEBUG) console.time("Create GameLoop");
    this.gameLoop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: (alpha) => this.render(alpha),
      },
      1000 / 60, // 60Hz physics
    );
    if (DEBUG) console.timeEnd("Create GameLoop");

    // Preload sounds asynchronously (don't block startup)
    this.initializeSounds();

    // Setup input callbacks
    const callbacks: InputCallbacks = {
      onUpdateVelocity: (vx, vy) => this.handleUpdateVelocity(vx, vy),
      onFire: (dx, dy) => this.handleFire(dx, dy),
      onInteract: (dx, dy) => this.handleInteract(dx, dy),
      onPickup: () => this.handlePickup(),
      onWait: () => this.handleWait(),
      onReload: () => this.handleReload(),
      onToggleFOV: () => this.handleToggleFOV(),
      onToggleRealTime: () => this.handleToggleRealTime(),
      onResumePause: (reason) => this.game.resumeFromPause(reason),
      onNewGame: () => this.handleNewGame(),
      onSave: () => this.handleSave(),
      onLoad: () => this.handleLoad(),
      onSelectWeapon: (slot) => this.handleSelectWeapon(slot),
    };

    this.inputHandler = new InputHandler(callbacks);

    // Setup click-to-move
    this.setupClickToMove();

    // Setup game over overlay actions
    this.newGameButton = document.getElementById("new-game-button");
    if (this.newGameButton) {
      this.newGameButton.addEventListener("click", this.onNewGameButtonClick);
    }

    // Setup native menu handlers for Electron
    this.setupNativeMenuHandlers();

    if (this.multiplayerMode === "online") {
      this.game.addLog(
        `Connecting to ${this.multiplayerConfig.serverUrl} (${this.multiplayerConfig.roomId})...`,
      );
      this.connectToMultiplayer();
    } else {
      // Try to load saved game, otherwise start new
      if (DEBUG) console.time("Load or start game");
      // Skip localStorage on initial load (slow in Electron)
      // User can explicitly load via menu if save exists
      this.game.reset(1);
      if (DEBUG) console.timeEnd("Load or start game");
    }

    if (DEBUG) console.time("First render");
    this.render(0);
    if (DEBUG) console.timeEnd("First render");

    this.reinitializePhysicsForCurrentState();

    // Center on player initially (after first render)
    this.centerOnPlayerSoon(INITIAL_CAMERA_CENTER_DELAY_MS);

    this.gameLoop.start();
    if (DEBUG) console.timeEnd("Game initialization");
  }

  /**
   * Initialize and preload sound effects
   */
  private async initializeSounds(): Promise<void> {
    try {
      await Sound.preload();
      if (DEBUG) console.log("✓ Sound effects loaded");
    } catch (error) {
      console.warn("Failed to preload sounds:", error);
    }
  }

  /**
   * Setup native menu event handlers for Electron
   */
  private setupNativeMenuHandlers(): void {
    if (window.native?.onNewGame) {
      window.native.onNewGame(() => this.handleNewGame());
    }
    if (window.native?.onSaveGame) {
      window.native.onSaveGame(() => this.handleSave());
    }
    if (window.native?.onLoadGame) {
      window.native.onLoadGame(() => this.handleLoad());
    }
  }

  private isOnlineMode(): boolean {
    return this.multiplayerMode === "online";
  }

  private isLocalPlayerDead(): boolean {
    if (this.isOnlineMode()) {
      return this.game.getState().player.hp <= 0;
    }
    return this.game.isPlayerDead();
  }

  private connectToMultiplayer(): void {
    this.multiplayerClient = new MultiplayerClient(
      this.multiplayerConfig.serverUrl,
      this.multiplayerConfig.roomId,
      this.multiplayerConfig.playerName,
    );

    this.multiplayerClient.onConnected((playerId, roomId) => {
      this.onlineConnected = true;
      this.game.addLog(
        `Connected as ${playerId.slice(0, 8)} in room ${roomId}.`,
      );
      this.render(0);
    });

    this.multiplayerClient.onState((serializedState) => {
      this.applyOnlineState(serializedState);
    });

    this.multiplayerClient.onDisconnected(() => {
      this.onlineConnected = false;
      this.game.addLog("Disconnected from multiplayer server.");
      this.render(0);
    });

    this.multiplayerClient.onError((message) => {
      this.game.addLog(message);
      this.render(0);
    });

    this.multiplayerClient.connect();
  }

  private applyOnlineState(
    serializedState: ReturnType<Game["serialize"]>,
  ): void {
    // Play any sounds queued by the server before deserializing
    if (serializedState.sounds && serializedState.sounds.length > 0) {
      for (const sound of serializedState.sounds) {
        Sound.play(sound as SoundEffect);
      }
    }

    this.game.deserialize(serializedState);
    const state = this.game.getState();

    this.syncGameOverOverlay(state.player.hp <= 0);

    this.lastPlayerHp = state.player.hp;
    this.render(0);
  }

  private syncGameOverOverlay(isDead: boolean): void {
    const gameOverOverlay = document.getElementById("game-over-overlay");
    if (!gameOverOverlay) {
      return;
    }

    if (isDead) {
      gameOverOverlay.classList.add("visible");
    } else {
      gameOverOverlay.classList.remove("visible");
    }
  }

  private syncOfflineDeathState(state: ReturnType<Game["getState"]>): void {
    this.game.updateDeathStatus();
    this.syncGameOverOverlay(state.player.hp <= 0);
  }

  private playPendingSounds(state: ReturnType<Game["getState"]>): void {
    for (const sound of state.pendingSounds) {
      Sound.play(sound as SoundEffect);
    }
    state.pendingSounds.length = 0;
  }

  private finalizeImmediateOfflineAction(
    state: ReturnType<Game["getState"]>,
    options: { autoSave?: boolean } = {},
  ): void {
    this.playPendingSounds(state);
    this.game.updateFOV();
    this.syncOfflineDeathState(state);

    if (options.autoSave ?? true) {
      this.autoSave();
    }
  }

  private runOfflinePlayerCommand(
    type: CommandType,
    data: CommandData,
    options: {
      tick?: number;
      resumeTime?: boolean;
      executeImmediately?: boolean;
      autoSave?: boolean;
    } = {},
  ): ReturnType<Game["getState"]> {
    const state = this.game.getState();

    if (options.resumeTime ?? true) {
      state.sim.targetTimeScale = 1.0;
    }

    enqueueCommand(state, {
      tick: options.tick ?? state.sim.nowTick,
      actorId: state.player.id,
      type,
      data,
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (options.executeImmediately ?? true) {
      stepSimulationTick(state);
      this.finalizeImmediateOfflineAction(state, {
        autoSave: options.autoSave,
      });
    } else if (options.autoSave ?? true) {
      this.autoSave();
    }

    return state;
  }

  private reinitializePhysicsForCurrentState(): void {
    const state = this.game.getState();
    this.physics.initializeMap(state.map);

    for (const entity of state.entities) {
      if (entity instanceof GameEntity) {
        this.physics.updateEntityBody(entity);
      }
    }
  }

  private centerOnPlayerSoon(delayMs: number): void {
    setTimeout(() => {
      const state = this.game.getState();
      this.renderer.centerOnPlayer(state.player, false);
    }, delayMs);
  }

  private reportOnlineActionUnavailable(): void {
    const now = performance.now();
    if (
      now - this.lastOnlineUnavailableLogAt <
      ONLINE_ACTION_UNAVAILABLE_LOG_THROTTLE_MS
    ) {
      return;
    }

    this.lastOnlineUnavailableLogAt = now;
    this.game.addLog("Multiplayer action unavailable while disconnected.");
    this.render(0);
  }

  private getReadyOnlineClient(): MultiplayerClient | null {
    if (
      !this.isOnlineMode() ||
      !this.multiplayerClient ||
      !this.onlineConnected
    ) {
      return null;
    }

    return this.multiplayerClient;
  }

  private sendOnlineAction(action: NetworkAction): boolean {
    const client = this.getReadyOnlineClient();
    if (!client) {
      return false;
    }

    client.sendAction(action);
    return true;
  }

  private dispatchOnlineAction(action: NetworkAction): boolean {
    const sent = this.sendOnlineAction(action);
    if (sent) {
      this.playerActedThisTick = true;
    } else {
      this.reportOnlineActionUnavailable();
    }
    return sent;
  }

  private selectOnlineWeapon(slot: number): boolean {
    const client = this.getReadyOnlineClient();
    if (!client) {
      this.reportOnlineActionUnavailable();
      return false;
    }

    client.selectWeapon(slot);
    return true;
  }

  private requestOnlineNewGame(): boolean {
    const client = this.getReadyOnlineClient();
    if (!client) {
      this.reportOnlineActionUnavailable();
      return false;
    }

    client.requestNewGame();
    return true;
  }

  private getWeaponSlot(weapon: WeaponType): number {
    if (weapon === WeaponType.MELEE) return 1;
    if (weapon === WeaponType.PISTOL) return 2;
    if (weapon === WeaponType.GRENADE) return 3;
    return 4;
  }

  /**
   * Setup click-to-move functionality
   */
  private setupClickToMove(): void {
    const canvas = document.getElementById("game") as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas not found for click-to-move");
      return;
    }

    this.gameCanvas = canvas;
    canvas.style.cursor = "pointer";

    canvas.addEventListener("click", this.onCanvasClick);
    canvas.addEventListener("contextmenu", this.onCanvasContextMenu);
    canvas.addEventListener("wheel", this.onCanvasWheel, { passive: false });
  }

  private triggerRightClickMove(
    tileX: number,
    tileY: number,
    wantsPickup: boolean,
  ): void {
    const state = this.game.getState();

    if (this.autoMovePath) {
      this.stopAutoMove(state);
    } else {
      this.clearAutoMoveTargets();
    }

    const hasItemOnTile =
      wantsPickup &&
      state.entities.some(
        (entity) =>
          entity.kind === EntityKind.ITEM &&
          entity.gridX === tileX &&
          entity.gridY === tileY,
      );
    const shouldPickupOnArrive = wantsPickup && hasItemOnTile;

    const tileIdx = idx(tileX, tileY);
    const tileType = state.map[tileIdx];

    const isHole = tileType === TileType.HOLE;
    const isStairsDown = tileType === TileType.STAIRS_DOWN;
    const isStairsUp = tileType === TileType.STAIRS_UP;

    if (
      isHole &&
      state.player.gridX === tileX &&
      state.player.gridY === tileY
    ) {
      this.executeHoleJump(tileX, tileY);
      return;
    }

    if (isStairsDown || isStairsUp) {
      this.clearAutoMoveTargets();

      if (state.player.gridX === tileX && state.player.gridY === tileY) {
        if (isStairsDown) {
          this.handleDescend();
        } else {
          this.handleAscend();
        }
        return;
      }

      this.autoMoveStairsTarget = {
        gridX: tileX,
        gridY: tileY,
        direction: isStairsDown ? "down" : "up",
      };
    } else {
      this.autoMoveStairsTarget = null;
    }

    const isDoor =
      tileType === TileType.DOOR_CLOSED ||
      tileType === TileType.DOOR_OPEN ||
      tileType === TileType.DOOR_LOCKED;

    if (isDoor) {
      this.autoMovePickupTarget = null;
      const dx = tileX - state.player.gridX;
      const dy = tileY - state.player.gridY;

      if (Math.abs(dx) + Math.abs(dy) === 1) {
        this.handleInteract(dx, dy);
        return;
      }
    }

    // Find path to clicked tile (or closest reachable)
    const path = findPathToClosestReachable(
      state.player.gridX,
      state.player.gridY,
      tileX,
      tileY,
      state.map,
      state.explored,
      state.entities,
    );

    if (path && path.length > 1) {
      // Store path for auto-movement (skip first element which is current position)
      this.autoMovePath = path.slice(1);
      this.autoMoveDoorTarget = isDoor ? { gridX: tileX, gridY: tileY } : null;
      this.autoMovePickupTarget =
        !this.autoMoveStairsTarget && shouldPickupOnArrive
          ? { gridX: tileX, gridY: tileY }
          : null;
      this.autoMoveHoleTarget = isHole ? { gridX: tileX, gridY: tileY } : null;
      // Speed up to real-time during click-to-move
      state.sim.targetTimeScale = 1.0;
    } else {
      this.autoMoveStairsTarget = null;
    }
  }

  /**
   * Handle mouse-based firing
   */
  private handleMouseFire(): void {
    // Fire with mouse aiming (dx/dy will be ignored)
    this.handleFire(0, 0);
  }

  /**
   * Update game logic at fixed timestep (called by GameLoop)
   */
  private update(dt: number): void {
    const state = this.game.getState();
    const isDead = this.isLocalPlayerDead();

    // Update mouse tracker with current camera position and scale
    const cameraPos = this.renderer.getCameraPosition();
    this.mouseTracker.setCameraPosition(cameraPos.x, cameraPos.y);
    this.mouseTracker.setScale(this.renderer.getScale());

    if (this.isOnlineMode()) {
      if (!this.onlineConnected) {
        state.sim.targetTimeScale = 0;
      }
      if (this.playerActedThisTick) {
        this.playerActedThisTick = false;
      }
      return;
    }

    this.updateAutoMove(state);

    // Smooth time scale transitions
    const timeDiff = state.sim.targetTimeScale - state.sim.timeScale;
    if (Math.abs(timeDiff) > 0.001) {
      // Interpolate toward target
      if (timeDiff > 0) {
        state.sim.timeScale = Math.min(
          state.sim.timeScale + TIME_SCALE_TRANSITION_SPEED,
          state.sim.targetTimeScale,
        );
      } else {
        state.sim.timeScale = Math.max(
          state.sim.timeScale - TIME_SCALE_TRANSITION_SPEED,
          state.sim.targetTimeScale,
        );
      }
    } else {
      // Snap to target when close enough
      state.sim.timeScale = state.sim.targetTimeScale;
    }

    // Apply time scaling to deltaTime
    const scaledDt = dt * state.sim.timeScale * REAL_TIME_SPEED;

    // Update physics (smooth movement with time scaling)
    this.physics.updatePhysics(state, scaledDt);

    // Update bullets
    this.physics.updateBullets(state, scaledDt);

    // Update explosives
    this.physics.updateExplosives(state, scaledDt);

    // Rebuild colliders immediately if walls were destroyed (outside sim tick)
    // This prevents players from colliding with invisible walls when bullets
    // destroy walls during real-time physics updates
    if (state.mapDirty) {
      state.mapDirty = false;
      this.physics.initializeMap(state.map);
    }

    // Advance simulation ticks with time scaling
    state.sim.accumulatorMs += scaledDt * 1000;
    while (state.sim.accumulatorMs >= SIM_DT_MS) {
      stepSimulationTick(state);
      this.playPendingSounds(state);
      state.sim.accumulatorMs -= SIM_DT_MS;
      this.game.updateFOV();

      // Update physics for any tiles that changed (e.g., doors opening/closing)
      if (state.changedTiles && state.changedTiles.size > 0) {
        for (const tileIndex of state.changedTiles) {
          const x = tileIndex % MAP_WIDTH;
          const y = Math.floor(tileIndex / MAP_WIDTH);
          const tile = state.map[tileIndex];
          this.physics.updateTile(x, y, tile);
        }
        state.changedTiles.clear();
      }

      this.syncOfflineDeathState(state);

      // Check for descend flag
      if (state.shouldDescend) {
        state.shouldDescend = false;
        this.game.descend();

        this.reinitializePhysicsForCurrentState();

        this.centerOnPlayerSoon(LEVEL_TRANSITION_CAMERA_DELAY_MS);
      }

      if (state.shouldAscend) {
        state.shouldAscend = false;
        this.game.ascend();

        this.reinitializePhysicsForCurrentState();

        this.centerOnPlayerSoon(LEVEL_TRANSITION_CAMERA_DELAY_MS);
      }
    }

    if (
      typeof this.lastPlayerHp === "number" &&
      state.player.hp < this.lastPlayerHp &&
      this.autoMovePath
    ) {
      this.stopAutoMove(state);
    }
    this.lastPlayerHp = state.player.hp;

    // Check if player has stopped moving
    const player = state.player;
    const playerMoving =
      Math.abs(player.velocityX) > 0.1 || Math.abs(player.velocityY) > 0.1;

    // Update target time scale based on player movement
    if (isDead) {
      state.sim.targetTimeScale = 1.0;
    }

    // Only enter slow-mo if player is not auto-moving
    if (
      !playerMoving &&
      !this.playerActedThisTick &&
      !isDead &&
      !this.autoMovePath
    ) {
      state.sim.targetTimeScale = SLOWMO_SCALE;
    }

    // Reset flag at end of update
    if (this.playerActedThisTick) {
      this.playerActedThisTick = false;
    }
  }

  /**
   * Render game at variable framerate with interpolation (called by GameLoop)
   */
  private render(alpha: number): void {
    const state = this.game.getState();
    const isDead = this.isLocalPlayerDead();
    const player = state.player;

    this.renderer.render(state, isDead, alpha);
    this.ui.updateAll(state.player, state.depth, state.log, state.sim);

    const hasVelocity =
      Math.abs(player.velocityX) > 0.05 || Math.abs(player.velocityY) > 0.05;
    const playerWorldX = player.worldX;
    const playerWorldY = player.worldY;
    const movedSinceLastFrame =
      typeof this.lastPlayerWorldX === "number" &&
      typeof this.lastPlayerWorldY === "number" &&
      (Math.abs(playerWorldX - this.lastPlayerWorldX) > 0.05 ||
        Math.abs(playerWorldY - this.lastPlayerWorldY) > 0.05);
    const playerMoving = hasVelocity || movedSinceLastFrame;

    if (playerMoving) {
      if (!this.wasPlayerMoving) {
        this.renderer.centerOnPlayer(state.player, false);
      }
      this.renderer.centerOnPlayer(state.player, true);
    }

    this.wasPlayerMoving = playerMoving;
    this.lastPlayerWorldX = playerWorldX;
    this.lastPlayerWorldY = playerWorldY;
  }

  /**
   * Handle velocity updates from WASD input
   */
  private handleUpdateVelocity(vx: number, vy: number): void {
    const state = this.game.getState();
    const player = state.player;

    if (this.isOnlineMode()) {
      if (!this.onlineConnected) {
        player.velocityX = 0;
        player.velocityY = 0;
        return;
      }
      if (this.isLocalPlayerDead()) return;
      player.velocityX = vx;
      player.velocityY = vy;
      const client = this.getReadyOnlineClient();
      if (!client) {
        player.velocityX = 0;
        player.velocityY = 0;
        return;
      }
      client.sendVelocity(vx, vy);
      if (vx !== 0 || vy !== 0) {
        this.cancelAutoMove();
      }
      return;
    }

    // Don't allow movement if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    // Set player velocity directly
    player.velocityX = vx;
    player.velocityY = vy;

    // If player is moving, resume time
    if (vx !== 0 || vy !== 0) {
      state.sim.targetTimeScale = 1.0;
      this.playerActedThisTick = true;
      this.cancelAutoMove();
    }
  }

  /**
   * Cancel automatic movement
   */
  private cancelAutoMove(): void {
    this.autoMovePath = null;
    this.clearAutoMoveTargets();
    if (this.pendingRightClickTimer !== null) {
      window.clearTimeout(this.pendingRightClickTimer);
      this.pendingRightClickTimer = null;
    }
    this.pendingRightClickTile = null;
  }

  private clearAutoMoveTargets(): void {
    this.autoMoveDoorTarget = null;
    this.autoMovePickupTarget = null;
    this.autoMoveHoleTarget = null;
    this.autoMoveStairsTarget = null;
  }

  private stopAutoMove(state: ReturnType<Game["getState"]>): void {
    this.cancelAutoMove();
    const player = state.player;
    player.velocityX = 0;
    player.velocityY = 0;
    // Return to slow-mo when auto-move is interrupted
    state.sim.targetTimeScale = SLOWMO_SCALE;
  }

  private updateAutoMove(state: ReturnType<Game["getState"]>): void {
    if (!this.autoMovePath || this.autoMovePath.length === 0) {
      return;
    }

    if (this.isLocalPlayerDead()) {
      this.stopAutoMove(state);
      return;
    }

    const player = state.player;

    const [targetX, targetY] = this.autoMovePath[0];
    const targetWorldX = targetX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const targetWorldY = targetY * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    const dx = targetWorldX - player.worldX;
    const dy = targetWorldY - player.worldY;
    const distance = Math.hypot(dx, dy);

    // Use larger threshold to prevent oscillation (about 1/4 of a tile)
    if (distance <= 8) {
      player.worldX = targetWorldX;
      player.worldY = targetWorldY;
      player.velocityX = 0;
      player.velocityY = 0;
      this.autoMovePath.shift();

      if (!this.autoMovePath || this.autoMovePath.length === 0) {
        const doorTarget = this.autoMoveDoorTarget;
        const pickupTarget = this.autoMovePickupTarget;
        const holeTarget = this.autoMoveHoleTarget;
        const stairsTarget = this.autoMoveStairsTarget;
        this.clearAutoMoveTargets();
        this.autoMovePath = null;
        let queuedHoleJump = false;

        if (doorTarget) {
          const doorDx = doorTarget.gridX - player.gridX;
          const doorDy = doorTarget.gridY - player.gridY;
          if (Math.abs(doorDx) + Math.abs(doorDy) === 1) {
            this.handleInteract(doorDx, doorDy);
          }
        }

        if (
          pickupTarget &&
          pickupTarget.gridX === player.gridX &&
          pickupTarget.gridY === player.gridY
        ) {
          this.handlePickup();
        }

        if (
          holeTarget &&
          holeTarget.gridX === player.gridX &&
          holeTarget.gridY === player.gridY
        ) {
          const holeTile =
            state.map[idx(holeTarget.gridX, holeTarget.gridY)] ===
            TileType.HOLE;
          if (holeTile) {
            this.queueHoleJump(holeTarget.gridX, holeTarget.gridY);
            this.playerActedThisTick = true;
            queuedHoleJump = true;
          }
        }

        if (
          stairsTarget &&
          stairsTarget.gridX === player.gridX &&
          stairsTarget.gridY === player.gridY
        ) {
          if (stairsTarget.direction === "down") {
            this.handleDescend();
          } else {
            this.handleAscend();
          }
        }

        // Return to slow-mo when auto-move completes
        state.sim.targetTimeScale = queuedHoleJump ? 1.0 : SLOWMO_SCALE;
      }
      return;
    }

    // Slow down when approaching waypoint to prevent overshooting
    const speed = MOVEMENT_SPEED;
    const approachDistance = 16; // Start slowing within half a tile
    const speedMultiplier = Math.min(1, distance / approachDistance);

    player.velocityX = (dx / distance) * speed * speedMultiplier;
    player.velocityY = (dy / distance) * speed * speedMultiplier;
    player.facingAngle = Math.atan2(dy, dx);
  }

  /**
   * Handle firing weapon
   */
  private handleFire(dx: number, dy: number): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const player = state.player;

    if (this.isOnlineMode()) {
      let facingAngle: number | undefined;
      facingAngle = this.mouseTracker.getAngleFrom(
        player.worldX,
        player.worldY,
      );
      this.dispatchOnlineAction({ type: "FIRE", dx, dy, facingAngle });
      return;
    }

    // Set player's facing angle based on mouse position for bullet direction
    const angle = this.mouseTracker.getAngleFrom(player.worldX, player.worldY);
    player.facingAngle = angle;

    this.runOfflinePlayerCommand(CommandType.FIRE, {
      type: "FIRE",
      dx,
      dy,
    });
  }

  private handleSelectWeapon(slot: number): void {
    const state = this.game.getState();
    const player = state.player;
    let weapon: WeaponType | null = null;

    if (slot === 1) weapon = WeaponType.MELEE;
    if (slot === 2) weapon = WeaponType.PISTOL;
    if (slot === 3) weapon = WeaponType.GRENADE;
    if (slot === 4) weapon = WeaponType.LAND_MINE;

    if (!weapon) return;

    if (this.isOnlineMode()) {
      this.selectOnlineWeapon(slot);
      return;
    }

    player.weapon = weapon;
    this.game.addLog(`Weapon set: ${weapon}.`);
  }

  private handleCycleWeapon(direction: number): void {
    const state = this.game.getState();
    const player = state.player;
    const weapons = [
      WeaponType.MELEE,
      WeaponType.PISTOL,
      WeaponType.GRENADE,
      WeaponType.LAND_MINE,
    ];
    const currentIndex = weapons.indexOf(player.weapon);
    const nextIndex =
      (currentIndex + direction + weapons.length) % weapons.length;

    if (this.isOnlineMode()) {
      const nextWeapon = weapons[nextIndex];
      this.selectOnlineWeapon(this.getWeaponSlot(nextWeapon));
      return;
    }

    player.weapon = weapons[nextIndex];
    this.game.addLog(`Weapon set: ${player.weapon}.`);
  }

  /**
   * Handle wait/rest
   */
  private handleWait(): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "WAIT" });
      return;
    }

    this.runOfflinePlayerCommand(CommandType.WAIT, { type: "WAIT" });
  }

  private queueHoleJump(tileX: number, tileY: number): void {
    const state = this.game.getState();
    if (!state.holeCreatedTiles) {
      state.holeCreatedTiles = new Set();
    }
    state.holeCreatedTiles.add(idx(tileX, tileY));
  }

  private executeHoleJump(tileX: number, tileY: number): void {
    if (this.isLocalPlayerDead()) {
      return;
    }

    if (this.isOnlineMode()) {
      this.game.addLog("Hole-jump shortcut is disabled in online multiplayer.");
      this.render(0);
      return;
    }

    const state = this.game.getState();
    this.queueHoleJump(tileX, tileY);

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;
    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);

    this.finalizeImmediateOfflineAction(state);
  }

  /**
   * Handle door interaction
   */
  private handleInteract(dx: number, dy: number): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    // Show prompt if no direction given
    if (dx === 0 && dy === 0) {
      this.game.addLog("Which direction?");
      return;
    }

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "INTERACT", dx, dy });
      return;
    }

    const state = this.game.getState();
    const player = state.player;

    const targetX = player.gridX + dx;
    const targetY = player.gridY + dy;

    this.runOfflinePlayerCommand(CommandType.INTERACT, {
      type: "INTERACT",
      x: targetX,
      y: targetY,
    });
  }

  /**
   * Handle pickup items
   */
  private handlePickup(): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "PICKUP" });
      return;
    }

    this.runOfflinePlayerCommand(CommandType.PICKUP, { type: "PICKUP" });
  }

  /**
   * Handle reload
   */
  private handleReload(): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "RELOAD" });
      return;
    }

    this.runOfflinePlayerCommand(CommandType.RELOAD, { type: "RELOAD" });
  }

  /**
   * Handle descending stairs
   */
  private handleDescend(): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "DESCEND" });
      return;
    }

    const currentState = this.game.getState();
    const state = this.runOfflinePlayerCommand(
      CommandType.DESCEND,
      { type: "DESCEND" },
      {
        tick:
          currentState.sim.mode === "PLANNING"
            ? currentState.sim.nowTick
            : currentState.sim.nowTick + 1,
        resumeTime: false,
        executeImmediately: currentState.sim.mode === "PLANNING",
        autoSave: false,
      },
    );

    if (state.sim.mode === "PLANNING") {
      if (state.shouldDescend) {
        state.shouldDescend = false;
        this.game.descend();
        // Center on player after level transition
        this.centerOnPlayerSoon(LEVEL_TRANSITION_CAMERA_DELAY_MS);
      }
    }

    this.autoSave();
  }

  /**
   * Handle ascending stairs
   */
  private handleAscend(): void {
    // Don't allow actions if player is dead
    if (this.isLocalPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "ASCEND" });
      return;
    }

    const currentState = this.game.getState();
    const state = this.runOfflinePlayerCommand(
      CommandType.ASCEND,
      { type: "ASCEND" },
      {
        tick:
          currentState.sim.mode === "PLANNING"
            ? currentState.sim.nowTick
            : currentState.sim.nowTick + 1,
        resumeTime: false,
        executeImmediately: currentState.sim.mode === "PLANNING",
        autoSave: false,
      },
    );

    if (state.sim.mode === "PLANNING") {
      if (state.shouldAscend) {
        state.shouldAscend = false;
        this.game.ascend();
        // Center on player after level transition
        this.centerOnPlayerSoon(LEVEL_TRANSITION_CAMERA_DELAY_MS);
      }
    }

    this.autoSave();
  }

  /**
   * Handle FOV toggle
   */
  private handleToggleFOV(): void {
    this.game.toggleFOV();
  }

  /**
   * Toggle real-time mode on/off
   */
  private handleToggleRealTime(): void {
    if (this.isOnlineMode()) {
      return;
    }
    this.realTimeToggled = !this.realTimeToggled;
    const state = this.game.getState();
    state.sim.targetTimeScale = this.realTimeToggled ? 1.0 : SLOWMO_SCALE;
  }

  /**
   * Handle new game
   */
  private handleNewGame(): void {
    if (this.isOnlineMode()) {
      // Reset input state to prevent phantom movement after new game in multiplayer
      this.inputHandler.resetKeys();
      this.requestOnlineNewGame();
      return;
    }

    this.cancelAutoMove();
    this.game.reset(1);

    this.syncGameOverOverlay(false);
    this.reinitializePhysicsForCurrentState();

    this.render(0);
    // Center on player after new game starts
    this.centerOnPlayerSoon(INITIAL_CAMERA_CENTER_DELAY_MS);
    this.lastPlayerHp = this.game.getState().player.hp;
    this.autoSave();
  }

  /**
   * Handle save game
   */
  private handleSave(): void {
    if (this.isOnlineMode()) {
      this.game.addLog("Save is disabled in online multiplayer.");
      this.render(0);
      return;
    }

    const saveData = JSON.stringify(this.game.serialize());

    // Try Electron save first
    if (window.native?.saveWrite) {
      window.native.saveWrite(saveData).then((result) => {
        if (result.ok) {
          this.game.addLog("Game saved.");
          this.render(0);
        } else {
          this.game.addLog("Save failed.");
          this.render(0);
        }
      });
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem("darkwar-save", saveData);
        this.game.addLog("Game saved.");
        this.render(0);
      } catch (e) {
        this.game.addLog("Failed to save game.");
        this.render(0);
      }
    }
  }

  /**
   * Handle load game
   */
  private async handleLoad(): Promise<void> {
    if (this.isOnlineMode()) {
      this.game.addLog("Load is disabled in online multiplayer.");
      this.render(0);
      return;
    }

    this.cancelAutoMove();

    if (await this.loadGame()) {
      this.game.addLog("Game loaded.");

      this.reinitializePhysicsForCurrentState();

      this.render(0);
      this.lastPlayerHp = this.game.getState().player.hp;
    } else {
      this.game.addLog("No save found.");
      this.render(0);
    }
  }

  /**
   * Auto-save game state
   */
  private autoSave(): void {
    if (this.isOnlineMode()) {
      return;
    }

    const saveData = JSON.stringify(this.game.serialize());

    // Try Electron save first
    if (window.native?.saveWrite) {
      window.native.saveWrite(saveData).catch(() => {
        // Silent fail for auto-save
      });
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem("darkwar-save", saveData);
      } catch (e) {
        // Silent fail for auto-save
      }
    }
  }

  /**
   * Load game from save
   */
  private async loadGame(): Promise<boolean> {
    if (this.isOnlineMode()) {
      return false;
    }

    if (window.native?.saveRead) {
      try {
        const result = await window.native.saveRead();
        if (result.ok && typeof result.data === "string") {
          const state = JSON.parse(result.data);
          this.game.deserialize(state);
          if (DEBUG) console.log("✓ Save game loaded from native storage");
          return true;
        }
      } catch (error) {
        console.error("Failed to load native save:", error);
      }
    }

    // Try localStorage
    try {
      const saveData = localStorage.getItem("darkwar-save");
      if (saveData) {
        const state = JSON.parse(saveData);
        this.game.deserialize(state);
        if (DEBUG) console.log("✓ Save game loaded");
        return true;
      }
    } catch (error) {
      console.error("Failed to load save:", error);
    }

    return false;
  }

  /**
   * Set the rendering scale
   */
  public setScale(scale: number): void {
    this.renderer.setScale(scale);
    const state = this.game.getState();
    this.renderer.render(state, this.isLocalPlayerDead(), 0);
    this.renderer.centerOnPlayer(state.player, false);
  }

  public dispose(): void {
    this.gameLoop.stop();
    this.cancelAutoMove();
    this.inputHandler.dispose();
    this.mouseTracker.destroy();
    this.multiplayerClient?.disconnect();

    if (this.gameCanvas) {
      this.gameCanvas.removeEventListener("click", this.onCanvasClick);
      this.gameCanvas.removeEventListener(
        "contextmenu",
        this.onCanvasContextMenu,
      );
      this.gameCanvas.removeEventListener("wheel", this.onCanvasWheel);
      this.gameCanvas = null;
    }

    if (this.newGameButton) {
      this.newGameButton.removeEventListener(
        "click",
        this.onNewGameButtonClick,
      );
      this.newGameButton = null;
    }
  }
}

// Initialize game when DOM is ready
const createDarkWarApp = (): void => {
  window.darkWarApp?.dispose();
  window.darkWarApp = new DarkWar();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    createDarkWarApp();
  });
} else {
  createDarkWarApp();
}
