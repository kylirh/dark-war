import { Game } from "./core/game";
import { GameLoop } from "./core/game-loop";
import { GameEntity } from "./entities/game-entity";
import { InputCallbacks, InputHandler, MOVEMENT_SPEED } from "./systems/input";
import { MouseTracker } from "./systems/mouse-tracker";
import { Music } from "./systems/music";
import { Physics } from "./systems/physics";
import { TileSource } from "./core/tile-source";
import {
  UserPreferences,
  loadPreferences,
  savePreferences,
} from "./systems/preferences";
import { Renderer } from "./systems/renderer";
import { stepSimulationTick } from "./systems/simulation/tick";
import { enqueueCommand } from "./systems/simulation/commands";
import { SIM_DT_MS } from "./systems/simulation/constants";
import { Sound, SoundEffect } from "./systems/sound";
import { TitleScreen } from "./systems/title-screen";
import { IntroStory } from "./systems/intro-story";
import { GameMenu } from "./systems/game-menu";
import { RetroWindowChrome } from "./systems/retro-window-chrome";
import {
  SaveSlotDialog,
  createSaveSlotRecord,
  deleteSaveSlot,
  hasSavedGame,
  readMostRecentSaveSlot,
  readSaveSlot,
  writeSaveSlot,
} from "./systems/save-slots";
import { UI } from "./systems/ui";
import { InventoryBar } from "./systems/inventory-bar";
import { CharacterModal, ModalTab } from "./systems/character-modal";
import {
  CELL_CONFIG,
  CommandData,
  CommandType,
  EntityKind,
  INVENTORY_BAR_SIZE,
  ItemType,
  MultiplayerMode,
  Player,
  REAL_TIME_SPEED,
  SLOWMO_SCALE,
  TileType,
  TIME_SCALE_TRANSITION_SPEED,
  WeaponType,
} from "./types";
import { getWeaponForSlot } from "./utils/inventory";
import { idxFor, inBoundsFor } from "./utils/helpers";

function weaponToItemType(weapon: WeaponType): ItemType | null {
  switch (weapon) {
    case WeaponType.PISTOL: return ItemType.PISTOL;
    case WeaponType.GRENADE: return ItemType.GRENADE;
    case WeaponType.LAND_MINE: return ItemType.LAND_MINE;
    default: return null;
  }
}
import {
  MultiplayerConfig,
  getMultiplayerConfigFromUrl,
} from "./utils/multiplayer";
import { findPathToClosestReachable } from "./utils/pathfinding";
import { MultiplayerClient, NetworkAction } from "./net/multiplayer-client";

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
const INITIAL_CAMERA_CENTER_DELAY_MS = 700;

/** Delay before recentering after a level transition. */
const LEVEL_TRANSITION_CAMERA_DELAY_MS = 50;

/** Minimum delay between repeated online-unavailable log messages. */
const ONLINE_ACTION_UNAVAILABLE_LOG_THROTTLE_MS = 1000;

/** The minimum accumulated deltaY to trigger the scroll wheel. Tunes the scroll wheel's sensitivity. */
const SCROLL_WHEEL_DELTA_THRESHOLD = 50; // Minimum accumulated deltaY to trigger the scroll wheel. Tunes the scroll wheel's sensitivity.

/** The delay between allowed scroll wheel changes. Tunes the scroll wheel's sensitivity. */
const SCROLL_WHEEL_THROTTLE_MS = 200; //

// Time scale constants
const REAL_TIME_SCALE = 0.85; // Slightly slowed "real-time" — full speed before/without CTDM

// Client-side prediction (online mode)
// How much of the residual error between the predicted and server-authoritative
// local-player position to correct per snapshot. Small enough to stay smooth,
// large enough that drift decays within a few snapshots once the player stops.
const PREDICTION_CORRECTION = 0.3;
// Above this gap (px) we stop trusting prediction and snap to the server: a
// teleport, a hole-fall, a respawn, or a major desync. ~1.5 tiles.
const PREDICTION_HARD_SNAP_PX = 48;

// CTDM time dilation constants
const CTDM_IDLE_SCALE = 0.35; // Timescale when CTDM is active but no threat detected
const CTDM_DRAIN_MAX = 8.0; // Max charge/sec drained at threat=1.0
const CTDM_RECHARGE_RATE = 3.0; // Charge/sec when moving or stationary with no threat
const CTDM_REENABLE_THRESHOLD = 20; // Auto-re-enable CTDM when charge crosses this from zero

type InitialGameMode = "new" | "load";

interface DarkWarApplication {
  dispose(): void;
}

interface DarkWarOptions {
  initialGame?: InitialGameMode;
  initialLoadSlot?: number;
  /** Pre-connected multiplayer client (bypasses URL-param based connection). */
  multiplayerClient?: MultiplayerClient;
  /** Player name for UI display when using a pre-connected client. */
  playerName?: string;
}

interface DiscoveredServer {
  ip: string;
  port: number;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: "lobby" | "playing";
}

// Global reference to save system and Electron IPC bridge
declare global {
  interface Window {
    native?: {
      // Save / load
      saveList: () => Promise<{
        ok: boolean;
        saves: Array<{ slot: number; data: string }>;
        error?: string;
      }>;
      saveWriteSlot: (
        slot: number,
        data: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      saveReadSlot: (
        slot: number,
      ) => Promise<{ ok: boolean; data?: string | null; error?: string }>;
      saveDeleteSlot: (
        slot: number,
      ) => Promise<{ ok: boolean; error?: string }>;
      // Game menu callbacks
      onNewGame: (callback: () => void) => void;
      onSaveGame: (callback: () => void) => void;
      onLoadGame: (callback: () => void) => void;
      onSoundSettings: (callback: () => void) => void;
      onAbout: (callback: () => void) => void;
      onAboutGame: (callback: () => void) => void;
      // Window control
      closeWindow: () => void;
      minimizeWindow: () => void;
      toggleMaximize: () => void;
      toggleFullscreen: () => void;
      setDevToolsEnabled: (enabled: boolean) => Promise<boolean>;
      getWindowBounds: () => Promise<{
        x: number;
        y: number;
        width: number;
        height: number;
      } | null>;
      setWindowBounds: (bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => void;
      setGameWindowOpaque: () => Promise<boolean>;
      onEnterFullscreen: (callback: () => void) => void;
      onLeaveFullscreen: (callback: () => void) => void;
      // Multiplayer: server lifecycle
      serverStart: (
        port?: number,
      ) => Promise<{ ok: boolean; port?: number; error?: string }>;
      serverStop: () => Promise<{ ok: boolean; error?: string }>;
      serverStatus: () => Promise<{ running: boolean; port: number | null }>;
      serverGetLocalIps: () => Promise<string[]>;
      onServerExited: (
        callback: (data: { code: number | null }) => void,
      ) => void;
      // Multiplayer: LAN discovery
      discoveryStartBroadcast: (info: {
        name: string;
        host: string;
        wsPort: number;
        players?: number;
        maxPlayers?: number;
        phase?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      discoveryUpdateBroadcast: (
        info: Partial<{
          name: string;
          host: string;
          wsPort: number;
          players: number;
          maxPlayers: number;
          phase: string;
        }>,
      ) => Promise<{ ok: boolean }>;
      discoveryStopBroadcast: () => Promise<{ ok: boolean }>;
      discoveryStartListen: () => Promise<{ ok: boolean; error?: string }>;
      discoveryStopListen: () => Promise<{ ok: boolean }>;
      discoveryGetServers: () => Promise<DiscoveredServer[]>;
    };
    darkWarApp?: DarkWarApplication;
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
  private inventoryBar: InventoryBar;
  private characterModal: CharacterModal;
  private gameMenu: GameMenu;
  private saveSlotDialog: SaveSlotDialog;
  private preferences: UserPreferences;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private inputHandler: InputHandler;
  private playerActedThisTick: boolean = false;
  private autoMovePath: [number, number][] | null = null;
  private autoMovePathIndex: number = 0;
  private autoMoveDoorTarget: { gridX: number; gridY: number } | null = null;
  private autoMovePickupTarget: { gridX: number; gridY: number } | null = null;
  private autoMoveHoleTarget: { gridX: number; gridY: number } | null = null;
  private autoMoveStairsTarget: {
    gridX: number;
    gridY: number;
    direction: "up" | "down";
  } | null = null;
  private currentThreatLevel: number = 0; // Last computed CTDM threat (0–1), shared between update/render
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
  // ── Client-side prediction (online mode, local player only) ──
  // Latest movement input from this client, applied to the predicted local
  // player each frame so input feels instant regardless of round-trip time.
  private localInputVx: number = 0;
  private localInputVy: number = 0;
  // True once the first authoritative snapshot has arrived, so we don't predict
  // against a not-yet-initialized world right after connecting.
  private hasOnlineSnapshot: boolean = false;
  // Snapshot-interpolation buffers for remote entities (online). Per entity id,
  // a short history of (time, x, y) server samples; rendered ~100ms in the past
  // so motion between 20Hz snapshots is smooth instead of snapping.
  private static readonly INTERP_DELAY_MS = 100;
  private readonly entityInterp = new Map<string, { t: number; x: number; y: number }[]>();
  private readonly entityDisplay = new Map<string, { x: number; y: number }>();
  // The TileSource the online prediction physics world was last built for.
  // When the server sends a new/changed level this differs, triggering a
  // rebuild of wall colliders for prediction.
  private predictionTilesRef: TileSource | null = null;
  private gameCanvas: HTMLCanvasElement | null = null;
  private newGameButton: HTMLElement | null = null;
  private introStory: IntroStory | null = null;
  private lastOnlineUnavailableLogAt: number = 0;
  private hasStartedGameLoop: boolean = false;
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

    const state = this.game.getState();
    if (!inBoundsFor(tileX, tileY, state.mapWidth, state.mapHeight)) {
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
      this.handleCycleSlot(direction);
      this.lastWheelTime = now;
      this.wheelDeltaAccumulator = 0;
    }
  };
  private readonly onNewGameButtonClick = (): void => {
    this.handleNewGame();
  };

  constructor(options: DarkWarOptions = {}) {
    if (DEBUG) console.time("Game initialization");
    this.preferences = loadPreferences();
    this.applyPreferences(false);
    if (DEBUG) console.time("Create Game instance");

    if (options.multiplayerClient) {
      // Pre-connected online mode: client was set up before DarkWar was created
      this.multiplayerMode = "online";
      this.multiplayerConfig = {
        mode: "online",
        serverUrl: "",
        roomId: "default",
        playerName: options.playerName ?? "Player",
      };
      this.multiplayerClient = options.multiplayerClient;
      this.onlineConnected = true;
    } else {
      this.multiplayerConfig = getMultiplayerConfigFromUrl();
      this.multiplayerMode = this.multiplayerConfig.mode;
    }

    this.game = new Game({ mode: this.multiplayerMode });
    if (DEBUG) console.timeEnd("Create Game instance");

    if (DEBUG) console.time("Create Physics");
    this.physics = new Physics();
    if (DEBUG) console.timeEnd("Create Physics");

    if (DEBUG) console.time("Create MouseTracker");
    this.mouseTracker = new MouseTracker("game");
    if (DEBUG) console.timeEnd("Create MouseTracker");

    if (DEBUG) console.time("Create Renderer");
    this.renderer = new Renderer("game", this.preferences.zoom);
    if (DEBUG) console.timeEnd("Create Renderer");

    if (DEBUG) console.time("Create UI");
    this.ui = new UI();
    if (DEBUG) console.timeEnd("Create UI");

    this.inventoryBar = new InventoryBar();
    this.inventoryBar.onSlotClick = (idx) => this.handleSelectInventorySlot(idx);

    this.characterModal = new CharacterModal({
      preferences: this.preferences,
      onPreferencesChange: (prefs) => this.handlePreferencesChange(prefs),
      onToggleGodMode: () => this.handleToggleGodMode(),
      onToggleFOV: () => this.handleToggleFOV(),
      // Multiplayer from within an active game session is not supported;
      // players must start multiplayer from the main menu.
    });
    this.characterModal.onClose = () => this.handleCharacterModalClose();
    this.characterModal.onWeaponChanged = () => {
      const state = this.game.getState();
      const player = state.player;
      player.weapon = getWeaponForSlot(player.inventorySlots[player.selectedBarSlot]);
    };
    this.characterModal.onInventorySwap = (from, to) => {
      // Online the server owns the inventory; mirror the local reorder to it so
      // it sticks instead of being overwritten by the next snapshot.
      if (this.isOnlineMode()) this.getReadyOnlineClient()?.swapInventory(from, to);
    };
    this.characterModal.onNewGame = () => this.handleNewGame();
    this.characterModal.onSave = () => this.handleSave();
    this.characterModal.onLoad = () => this.handleLoad();
    this.characterModal.onQuit = () => this.handleQuit();

    if (DEBUG) console.time("Create GameLoop");
    this.gameLoop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: (alpha) => this.render(alpha),
      },
      1000 / 60, // 60Hz physics
    );
    if (DEBUG) console.timeEnd("Create GameLoop");

    // Dialog and menu bridge
    this.gameMenu = new GameMenu({
      pausesGame: false,
      allowSaveLoad: !this.isOnlineMode(),
      preferences: this.preferences,
      onModalStateChange: (hasOpenModal) =>
        this.handleModalStateChange(hasOpenModal),
      onPreferencesChange: (preferences) =>
        this.handlePreferencesChange(preferences),
      onContinue: () => this.gameMenu.closePauseMenu(true),
      onNewGame: () => this.handleNewGame(),
      onSave: () => this.handleSave(),
      onLoad: () => this.handleLoad(),
      onQuit: () => this.handleQuit(),
      onToggleFOV: () => this.handleToggleFOV(),
      onToggleGodMode: () => this.handleToggleGodMode(),
    });
    this.saveSlotDialog = new SaveSlotDialog({
      onOpenChange: (isOpen) => this.handleModalStateChange(isOpen),
      onSaveSlot: (slot) => this.saveGameToSlot(slot),
      onLoadSlot: (slot) => this.loadGameFromSlot(slot),
      onDeleteSlot: (slot) => this.deleteGameSaveSlot(slot),
    });

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
      onToggleCTDM: () => this.handleToggleCTDM(),
      onToggleGodMode: () => this.handleToggleGodMode(),
      onResumePause: (reason) => this.game.resumeFromPause(reason),
      onNewGame: () => this.handleNewGame(),
      onSave: () => this.handleSave(),
      onLoad: () => this.handleLoad(),
      onSelectWeapon: (slot) => this.handleSelectWeapon(slot),
      onSelectInventorySlot: (idx) => this.handleSelectInventorySlot(idx),
      onOpenInventory: (tab) => this.handleOpenInventory(tab),
      onCycleSlot: (dir) => this.handleCycleSlot(dir),
    };

    this.inputHandler = new InputHandler(callbacks, () => this.preferences);

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
      if (options.multiplayerClient) {
        // Pre-connected: just wire up callbacks and start rendering
        this.setupOnlineClientCallbacks(options.multiplayerClient);
        this.game.addStory("Multiplayer game starting...");
      } else {
        // URL-param based connection (legacy / dev mode)
        this.game.addStory(
          `Connecting to ${this.multiplayerConfig.serverUrl} (${this.multiplayerConfig.roomId})...`,
        );
        this.connectToMultiplayer();
      }
      this.finishInitialGameStartup();
    } else {
      if (options.initialGame === "load") {
        this.loadInitialSavedGame(options.initialLoadSlot);
      } else {
        if (DEBUG) console.time("Start new game");
        this.game.reset(0);
        if (DEBUG) console.timeEnd("Start new game");
        this.finishInitialGameStartup();
      }
    }
    if (DEBUG) console.timeEnd("Game initialization");
  }

  private async loadInitialSavedGame(slot?: number): Promise<void> {
    if (DEBUG) console.time("Load saved game");
    const didLoad =
      typeof slot === "number"
        ? await this.loadGameFromSlot(slot, { quiet: true })
        : await this.loadMostRecentGame({ quiet: true });
    if (!didLoad) {
      this.game.reset(0);
      this.game.addStory("No save found. Starting a new game.");
    }
    if (DEBUG) console.timeEnd("Load saved game");
    this.finishInitialGameStartup();
  }

  private finishInitialGameStartup(): void {
    if (this.hasStartedGameLoop) {
      return;
    }
    this.hasStartedGameLoop = true;
    if (DEBUG) console.time("First render");
    this.render(0);
    if (DEBUG) console.timeEnd("First render");

    this.reinitializePhysicsForCurrentState();

    // Center on player initially (after first render)
    this.centerOnPlayerSoon(INITIAL_CAMERA_CENTER_DELAY_MS);

    const state = this.game.getState();
    Music.updateForGameState(state, this.computeThreatLevel(state));
    this.gameLoop.start();
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
    if (window.native?.onSoundSettings) {
      window.native.onSoundSettings(() => this.handleOpenInventory("settings"));
    }
    if (window.native?.onAbout) {
      window.native.onAbout(() => this.gameMenu.openAboutDialog());
    }
    if (window.native?.onAboutGame) {
      window.native.onAboutGame(() => this.gameMenu.openAboutDialog());
    }
  }

  private isOnlineMode(): boolean {
    return this.multiplayerMode === "online";
  }

  private handleQuit(): void {
    if (window.native?.closeWindow) {
      window.native.closeWindow();
      return;
    }

    window.close();
  }

  private handlePreferencesChange(preferences: UserPreferences): void {
    this.preferences = {
      ...preferences,
      keyBindings: { ...preferences.keyBindings },
    };
    savePreferences(this.preferences);
    this.applyPreferences();
    // Keep CharacterModal in sync if prefs changed from elsewhere (e.g. GameMenu)
    this.characterModal.setPreferences(this.preferences);

    if (this.preferences.devTools) {
      console.info("Dark War preferences updated.", this.preferences);
    }
  }

  private applyPreferences(applyScale: boolean = true): void {
    Sound.setVolume(this.preferences.sfxVolume);
    Music.setVolume(this.preferences.musicVolume);
    document.documentElement.dataset.theme = this.preferences.theme;

    if (applyScale && this.renderer) {
      this.setScale(this.preferences.zoom);
    }

    window.native
      ?.setDevToolsEnabled(this.preferences.devTools)
      .catch(() => {});
  }

  private handleModalStateChange(hasOpenModal: boolean): void {
    if (this.isOnlineMode()) {
      return;
    }

    if (hasOpenModal) {
      this.cancelAutoMove();
      this.inputHandler?.resetKeys();
      this.gameLoop.pause();
      return;
    }

    this.inputHandler?.resetKeys();
    this.gameLoop.resume();
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
    this.setupOnlineClientCallbacks(this.multiplayerClient);
    this.multiplayerClient.connect();
  }

  private setupOnlineClientCallbacks(client: MultiplayerClient): void {
    client.onConnected((playerId, roomId, _isHost) => {
      this.onlineConnected = true;
      this.hasOnlineSnapshot = false;
      this.predictionTilesRef = null;
      this.game.addStory(`Connected as ${playerId.slice(0, 8)} in room ${roomId}.`);
      this.render(0);
    });

    client.onState((serializedState) => {
      this.applyOnlineState(serializedState);
    });

    client.onDisconnected(() => {
      this.onlineConnected = false;
      this.hasOnlineSnapshot = false;
      this.game.addStory("Disconnected from multiplayer server.");
      this.render(0);
    });

    client.onError((message) => {
      this.game.addStory(message);
      this.render(0);
    });
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

    // Capture the predicted local-player position before the authoritative
    // state overwrites it, so we can reconcile rather than hard-snap.
    const previousPlayer = this.game.getState().player;
    const hadPrediction =
      this.onlineConnected && previousPlayer != null && previousPlayer.hp > 0;
    const predictedX = previousPlayer?.worldX;
    const predictedY = previousPlayer?.worldY;

    this.game.deserialize(serializedState);
    const state = this.game.getState();
    const player = state.player;

    if (
      hadPrediction &&
      predictedX !== undefined &&
      predictedY !== undefined &&
      player.hp > 0
    ) {
      this.reconcileLocalPlayer(player, predictedX, predictedY);
      // Keep moving under the latest local input, not the server's older echo.
      player.velocityX = this.localInputVx;
      player.velocityY = this.localInputVy;
    }

    this.syncGameOverOverlay(player.hp <= 0);

    this.lastPlayerHp = player.hp;
    this.recordEntitySnapshots(state);
    this.interpolateRemoteEntities(state);

    this.hasOnlineSnapshot = true;
    this.render(0);
  }

  /** Record this snapshot's server positions for remote-entity interpolation. */
  private recordEntitySnapshots(state: ReturnType<Game["getState"]>): void {
    const now = performance.now();
    const live = new Set<string>();
    for (const e of state.entities) {
      if (!("worldX" in e)) continue;
      live.add(e.id);
      let buf = this.entityInterp.get(e.id);
      if (!buf) {
        buf = [];
        this.entityInterp.set(e.id, buf);
      }
      buf.push({ t: now, x: (e as GameEntity).worldX, y: (e as GameEntity).worldY });
      if (buf.length > 6) buf.shift();
    }
    for (const id of [...this.entityInterp.keys()]) {
      if (!live.has(id)) {
        this.entityInterp.delete(id);
        this.entityDisplay.delete(id);
      }
    }
  }

  /**
   * Place each remote entity at its interpolated position ~100ms in the past so
   * it glides between 20Hz server snapshots. The local player is skipped (it is
   * predicted), and entities without enough history fall back to the raw server
   * position. Called every frame and on each snapshot.
   */
  private interpolateRemoteEntities(state: ReturnType<Game["getState"]>): void {
    const localId = state.player?.id;
    const renderTime = performance.now() - DarkWar.INTERP_DELAY_MS;

    for (const e of state.entities) {
      if (!("worldX" in e) || e.id === localId) continue;
      const buf = this.entityInterp.get(e.id);
      if (!buf || buf.length < 2) continue;

      // Newer than our buffered window → leave at the latest server position.
      if (renderTime >= buf[buf.length - 1].t) continue;

      let s0 = buf[0];
      let s1 = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && renderTime <= buf[i + 1].t) {
          s0 = buf[i];
          s1 = buf[i + 1];
          break;
        }
      }
      const span = s1.t - s0.t;
      const a = span > 0 ? (renderTime - s0.t) / span : 0;
      const ix = s0.x + (s1.x - s0.x) * a;
      const iy = s0.y + (s1.y - s0.y) * a;

      const ent = e as GameEntity;
      const prev = this.entityDisplay.get(e.id) ?? { x: ix, y: iy };
      ent.prevWorldX = prev.x;
      ent.prevWorldY = prev.y;
      ent.worldX = ix;
      ent.worldY = iy;
      this.entityDisplay.set(e.id, { x: ix, y: iy });
    }
  }

  /**
   * Reconcile the predicted local-player position with the server's
   * authoritative one. On a small error we keep most of the prediction and
   * ease out the residual (so steady-state drift decays without the player
   * being yanked); on a large error — teleport, hole-fall, respawn — we accept
   * the server position outright. `player` arrives already at the server pos.
   */
  private reconcileLocalPlayer(
    player: Player,
    predictedX: number,
    predictedY: number,
  ): void {
    const serverX = player.worldX;
    const serverY = player.worldY;
    const errorX = predictedX - serverX;
    const errorY = predictedY - serverY;
    const distance = Math.hypot(errorX, errorY);

    if (distance > PREDICTION_HARD_SNAP_PX) {
      // Accept the server position (player is already there). Reset
      // interpolation so we don't render a streak across the jump.
      player.prevWorldX = serverX;
      player.prevWorldY = serverY;
      return;
    }

    const correctedX = serverX + errorX * (1 - PREDICTION_CORRECTION);
    const correctedY = serverY + errorY * (1 - PREDICTION_CORRECTION);
    player.worldX = correctedX;
    player.worldY = correctedY;
    player.prevWorldX = correctedX;
    player.prevWorldY = correctedY;
  }

  /**
   * Advance the predicted local player one frame under the latest local input
   * so movement feels instant. Only the local player is predicted; all other
   * entities come straight from the server. The server stays authoritative and
   * corrections arrive via reconcileLocalPlayer().
   */
  private predictLocalPlayer(
    state: ReturnType<Game["getState"]>,
    dt: number,
  ): void {
    const player = state.player;
    if (!player || player.hp <= 0) return;

    this.ensurePredictionWorld(state);

    player.velocityX = this.localInputVx;
    player.velocityY = this.localInputVy;

    const scaledDt = dt * (state.sim.timeScale ?? 1);
    this.physics.predictLocalMovement(
      state,
      player as unknown as GameEntity,
      scaledDt,
    );
  }

  /**
   * Ensure the prediction physics world matches the current level. The map
   * reference changes whenever the server sends a new or modified map (level
   * transition, destructible walls), at which point we rebuild wall colliders
   * and drop any stale entity bodies — prediction only needs walls plus the
   * local player's own body (recreated on demand).
   */
  private ensurePredictionWorld(
    state: ReturnType<Game["getState"]>,
  ): void {
    if (this.predictionTilesRef === state.tiles) return;
    this.physics.initializeMap(state.tiles);
    this.physics.clearEntityBodies();
    this.predictionTilesRef = state.tiles;
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
    const player = state.player;
    const MAX_SOUND_DIST = 32 * 18; // 18 tiles = full falloff range
    const MAX_SOUND_DIST_SQ = MAX_SOUND_DIST * MAX_SOUND_DIST;
    for (const pending of state.pendingSounds) {
      let volume = Sound.getVolume();
      if (pending.worldX !== undefined && pending.worldY !== undefined) {
        const dx = pending.worldX - player.worldX;
        const dy = pending.worldY - player.worldY;
        const distSq = dx * dx + dy * dy;
        if (distSq >= MAX_SOUND_DIST_SQ) continue;
        const d = Math.sqrt(distSq);
        volume = Sound.getVolume() * Math.max(0, 1 - d / MAX_SOUND_DIST);
      }
      if (volume > 0.01) {
        Sound.play(pending.effect as SoundEffect, volume);
      }
    }
    state.pendingSounds.length = 0;
  }

  private finalizeImmediateOfflineAction(
    state: ReturnType<Game["getState"]>,
  ): void {
    this.playPendingSounds(state);
    this.game.updateFOV();
    this.syncOfflineDeathState(state);
  }

  private runOfflinePlayerCommand(
    type: CommandType,
    data: CommandData,
    options: {
      tick?: number;
      resumeTime?: boolean;
      executeImmediately?: boolean;
    } = {},
  ): ReturnType<Game["getState"]> {
    const state = this.game.getState();

    if (options.resumeTime ?? true) {
      state.sim.targetTimeScale = REAL_TIME_SCALE;
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
      this.finalizeImmediateOfflineAction(state);
    }

    return state;
  }

  private reinitializePhysicsForCurrentState(): void {
    this.physics.rebuildAll(this.game.getState());
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
    this.game.addStory("Multiplayer action unavailable while disconnected.");
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

    const tileIdx = idxFor(tileX, tileY, state.mapWidth);
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
      state.mapWidth,
      state.mapHeight,
    );

    if (path && path.length > 1) {
      // Store path for auto-movement; index starts at 1 to skip current position
      this.autoMovePath = path;
      this.autoMovePathIndex = 1;
      this.autoMoveDoorTarget = isDoor ? { gridX: tileX, gridY: tileY } : null;
      this.autoMovePickupTarget =
        !this.autoMoveStairsTarget && shouldPickupOnArrive
          ? { gridX: tileX, gridY: tileY }
          : null;
      this.autoMoveHoleTarget = isHole ? { gridX: tileX, gridY: tileY } : null;
      // Speed up to real-time during click-to-move
      state.sim.targetTimeScale = REAL_TIME_SCALE;
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
      } else if (this.hasOnlineSnapshot) {
        // Advance click-to-move first so the steering velocity it sets feeds
        // this frame's prediction and gets sent to the server.
        this.updateAutoMove(state);
        this.predictLocalPlayer(state, dt);
        // Glide remote entities between snapshots.
        this.interpolateRemoteEntities(state);
      }
      Music.updateForGameState(state, this.computeThreatLevel(state));
      if (this.playerActedThisTick) {
        this.playerActedThisTick = false;
      }
      return;
    }

    // Stream in dungeon chunks around the player (offline). Carved tiles get
    // their colliders reconciled via the changedTiles pass below.
    this.game.streamAroundPlayers();

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
      this.physics.initializeMap(state.tiles);
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
          const x = tileIndex % state.mapWidth;
          const y = Math.floor(tileIndex / state.mapWidth);
          this.physics.updateTile(state.tiles, x, y);
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

    const musicThreatLevel = this.computeThreatLevel(state);

    // Compute CTDM threat level when the device is active
    this.currentThreatLevel =
      player.hasCTDM && player.ctdmEnabled ? musicThreatLevel : 0;
    Music.updateForGameState(state, musicThreatLevel);

    // Update target time scale based on CTDM status and threat
    if (isDead) {
      state.sim.targetTimeScale = REAL_TIME_SCALE;
    } else if (playerMoving || this.playerActedThisTick) {
      // Moving or acted: real-time; recharge CTDM
      state.sim.targetTimeScale = REAL_TIME_SCALE;
      if (player.hasCTDM) {
        const prevCharge = player.ctdmCharge;
        player.ctdmCharge = Math.min(
          player.ctdmChargeMax,
          player.ctdmCharge + CTDM_RECHARGE_RATE * dt,
        );
        if (
          !player.ctdmEnabled &&
          prevCharge < CTDM_REENABLE_THRESHOLD &&
          player.ctdmCharge >= CTDM_REENABLE_THRESHOLD
        ) {
          player.ctdmEnabled = true;
          state.story.unshift("CTDM recharged.");
        }
      }
    } else if (player.hasCTDM && player.ctdmEnabled && player.ctdmCharge > 0) {
      // CTDM active and stationary: threat-based time dilation
      const threat = this.currentThreatLevel;
      state.sim.targetTimeScale =
        SLOWMO_SCALE + (1 - threat) * (CTDM_IDLE_SCALE - SLOWMO_SCALE);

      if (threat > 0.05) {
        // Drain proportional to threat level
        player.ctdmCharge = Math.max(
          0,
          player.ctdmCharge - threat * CTDM_DRAIN_MAX * dt,
        );
        if (player.ctdmCharge <= 0) {
          player.ctdmEnabled = false;
          state.story.unshift("CTDM battery depleted.");
        }
      } else {
        // No threat: slow recharge while stationary
        player.ctdmCharge = Math.min(
          player.ctdmChargeMax,
          player.ctdmCharge + CTDM_RECHARGE_RATE * 0.5 * dt,
        );
      }
    } else if (player.hasCTDM && !player.ctdmEnabled) {
      // CTDM disabled (depleted or manually off): real-time, recharge
      state.sim.targetTimeScale = REAL_TIME_SCALE;
      const prevCharge = player.ctdmCharge;
      player.ctdmCharge = Math.min(
        player.ctdmChargeMax,
        player.ctdmCharge + CTDM_RECHARGE_RATE * dt,
      );
      if (
        prevCharge < CTDM_REENABLE_THRESHOLD &&
        player.ctdmCharge >= CTDM_REENABLE_THRESHOLD
      ) {
        player.ctdmEnabled = true;
        state.story.unshift("CTDM recharged.");
      }
    } else {
      // No CTDM: real-time until the device is found
      state.sim.targetTimeScale = REAL_TIME_SCALE;
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
    this.ui.updateAll(
      state.player,
      state.depth,
      state.story,
      state.sim,
      this.currentThreatLevel,
      state.options.godMode,
    );
    this.inventoryBar.update(state.player);
    if (this.characterModal.isOpen()) {
      this.characterModal.renderInventory(state.player);
    }

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
      this.localInputVx = vx;
      this.localInputVy = vy;
      const client = this.getReadyOnlineClient();
      if (!client) {
        player.velocityX = 0;
        player.velocityY = 0;
        this.localInputVx = 0;
        this.localInputVy = 0;
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
      state.sim.targetTimeScale = REAL_TIME_SCALE;
      this.playerActedThisTick = true;
      this.cancelAutoMove();
    }
  }

  /**
   * Cancel automatic movement
   */
  private cancelAutoMove(): void {
    this.autoMovePath = null;
    this.autoMovePathIndex = 0;
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
    if (this.isOnlineMode()) this.setOnlineMoveIntent(0, 0);
  }

  /**
   * Apply a movement intent for the local player in online mode: predict it
   * locally and forward it to the authoritative server. Only re-sends when the
   * velocity changes meaningfully so click-to-move doesn't flood the socket.
   */
  private setOnlineMoveIntent(vx: number, vy: number): void {
    const changed =
      Math.abs(vx - this.localInputVx) > 1 || Math.abs(vy - this.localInputVy) > 1;
    const player = this.game.getState().player;
    player.velocityX = vx;
    player.velocityY = vy;
    this.localInputVx = vx;
    this.localInputVy = vy;
    if (changed) this.getReadyOnlineClient()?.sendVelocity(vx, vy);
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

    const [targetX, targetY] = this.autoMovePath[this.autoMovePathIndex];
    const targetWorldX = targetX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const targetWorldY = targetY * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    const dx = targetWorldX - player.worldX;
    const dy = targetWorldY - player.worldY;
    const distance = Math.hypot(dx, dy);

    // Use larger threshold to prevent oscillation (about 1/4 of a tile)
    if (distance <= 8) {
      // Offline we own the position and can snap to the waypoint; online the
      // server is authoritative, so just advance and let prediction carry us.
      if (!this.isOnlineMode()) {
        player.worldX = targetWorldX;
        player.worldY = targetWorldY;
        player.velocityX = 0;
        player.velocityY = 0;
      }
      this.autoMovePathIndex++;

      if (
        !this.autoMovePath ||
        this.autoMovePathIndex >= this.autoMovePath.length
      ) {
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
            state.map[
              idxFor(holeTarget.gridX, holeTarget.gridY, state.mapWidth)
            ] === TileType.HOLE;
          // Online the server drops the player once they're on the hole tile;
          // offline we queue the deliberate hole jump locally.
          if (holeTile && !this.isOnlineMode()) {
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

        if (queuedHoleJump) {
          state.sim.targetTimeScale = REAL_TIME_SCALE;
        }

        // Arrived: stop the player on the server too.
        if (this.isOnlineMode()) this.setOnlineMoveIntent(0, 0);
      }
      return;
    }

    // Slow down when approaching waypoint to prevent overshooting
    const speed = MOVEMENT_SPEED;
    const approachDistance = 16; // Start slowing within half a tile
    const speedMultiplier = Math.min(1, distance / approachDistance);

    const vx = (dx / distance) * speed * speedMultiplier;
    const vy = (dy / distance) * speed * speedMultiplier;
    player.facingAngle = Math.atan2(dy, dx);

    if (this.isOnlineMode()) {
      this.setOnlineMoveIntent(vx, vy);
    } else {
      player.velocityX = vx;
      player.velocityY = vy;
    }
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
      const target = this.mouseTracker.getWorldPosition();
      if (facingAngle !== undefined) player.facingAngle = facingAngle;
      // Predict the shot's audio locally so firing feels instant; the server
      // suppresses its echo of our own shoot sound to avoid doubling. The bullet
      // and hit resolution stay server-authoritative.
      if (player.weapon === WeaponType.PISTOL && player.ammo > 0) {
        Sound.play(SoundEffect.SHOOT);
      }
      this.dispatchOnlineAction({
        type: "FIRE",
        dx,
        dy,
        facingAngle,
        targetWorldX: target.x,
        targetWorldY: target.y,
      });
      return;
    }

    // Set player's facing angle based on mouse position for bullet direction
    const angle = this.mouseTracker.getAngleFrom(player.worldX, player.worldY);
    player.facingAngle = angle;

    this.runOfflinePlayerCommand(CommandType.FIRE, {
      type: "FIRE",
      dx,
      dy,
      targetWorldX: this.mouseTracker.getWorldPosition().x,
      targetWorldY: this.mouseTracker.getWorldPosition().y,
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
      this.selectOnlineWeaponByType(weapon);
      return;
    }

    // Try to find the slot in the inventory bar that holds this weapon type
    const weaponItemType = weaponToItemType(weapon);
    if (weaponItemType !== null) {
      const barSlot = player.inventorySlots
        .slice(0, INVENTORY_BAR_SIZE)
        .findIndex((s) => s.type === weaponItemType);
      if (barSlot >= 0) {
        player.selectedBarSlot = barSlot;
      }
    } else {
      // Melee: find first empty bar slot or just keep current
    }

    player.weapon = weapon;
    this.game.addStory(`Weapon set: ${weapon}.`);
  }

  /**
   * Online: select the inventory bar slot that holds the given weapon (so the
   * authoritative server resolves the weapon from the player's real inventory).
   */
  private selectOnlineWeaponByType(weapon: WeaponType): void {
    const player = this.game.getState().player;
    const barSlot = player.inventorySlots
      .slice(0, INVENTORY_BAR_SIZE)
      .findIndex((s) => getWeaponForSlot(s) === weapon);
    if (barSlot >= 0) this.handleSelectInventorySlot(barSlot);
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
      this.selectOnlineWeaponByType(weapons[nextIndex]);
      return;
    }

    player.weapon = weapons[nextIndex];
    this.game.addStory(`Weapon set: ${player.weapon}.`);
  }

  private handleSelectInventorySlot(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= INVENTORY_BAR_SIZE) return;

    const state = this.game.getState();
    const player = state.player;

    // Apply locally for an instant response; the server is authoritative over
    // selectedBarSlot/weapon and confirms (or corrects) on the next snapshot.
    player.selectedBarSlot = slotIndex;
    player.weapon = getWeaponForSlot(player.inventorySlots[slotIndex]);

    if (this.isOnlineMode()) {
      this.selectOnlineWeapon(slotIndex);
    }
  }

  private handleCycleSlot(direction: number): void {
    const state = this.game.getState();
    const player = state.player;
    const next =
      (player.selectedBarSlot + direction + INVENTORY_BAR_SIZE) % INVENTORY_BAR_SIZE;
    this.handleSelectInventorySlot(next);
  }

  private handleOpenInventory(tab: ModalTab): void {
    const state = this.game.getState();

    if (this.characterModal.isOpen()) {
      if (this.characterModal.currentTab === tab) {
        // Same tab pressed again → close
        this.characterModal.close();
      } else {
        // Different tab → switch
        this.characterModal.open(tab, state.player);
      }
      return;
    }

    if (!this.isOnlineMode()) {
      this.gameLoop.pause();
    }
    this.inventoryBar.setVisible(false);
    this.characterModal.open(tab, state.player);
  }

  private handleCharacterModalClose(): void {
    this.inventoryBar.setVisible(true);
    if (!this.isOnlineMode()) {
      this.gameLoop.resume();
    }
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
    state.holeCreatedTiles.add(idxFor(tileX, tileY, state.mapWidth));
  }

  private executeHoleJump(tileX: number, tileY: number): void {
    if (this.isLocalPlayerDead()) {
      return;
    }

    if (this.isOnlineMode()) {
      // Online: holes are server-authoritative. Standing on a hole tile makes
      // the server drop just this player to the next level, so there's nothing
      // to do here beyond letting movement carry the player onto it.
      return;
    }

    const state = this.game.getState();
    this.queueHoleJump(tileX, tileY);

    // Resume time when player acts
    state.sim.targetTimeScale = REAL_TIME_SCALE;
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
      this.game.addStory("Which direction?");
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
  }

  /**
   * Handle FOV toggle
   */
  private handleToggleFOV(): void {
    if (!this.preferences.devTools) {
      return;
    }
    this.game.toggleFOV();
  }

  /**
   * Handle God Mode toggle
   */
  private handleToggleGodMode(): void {
    if (!this.preferences.devTools) {
      return;
    }

    if (this.isOnlineMode()) {
      this.dispatchOnlineAction({ type: "TOGGLE_GOD_MODE" });
      return;
    }

    this.game.toggleGodMode();
  }

  /**
   * Toggle the CTDM device on/off (C key)
   */
  private handleToggleCTDM(): void {
    if (this.isOnlineMode()) return;
    const state = this.game.getState();
    const player = state.player;
    if (!player.hasCTDM) return;
    player.ctdmEnabled = !player.ctdmEnabled;
    const statusMsg = player.ctdmEnabled ? "CTDM enabled." : "CTDM disabled.";
    state.story.unshift(statusMsg);
  }

  /**
   * Compute a 0–1 threat level from visible monsters and incoming bullets.
   * Higher values produce stronger time dilation when the player is stationary.
   */
  private computeThreatLevel(state: ReturnType<Game["getState"]>): number {
    const player = state.player;
    const sightPx = player.sight * CELL_CONFIG.w;
    const sightPxSq = sightPx * sightPx;
    const bulletDangerSq = CELL_CONFIG.w * 5 * (CELL_CONFIG.w * 5);
    let maxThreat = 0;

    for (const entity of state.entities) {
      if (entity.kind === EntityKind.MONSTER) {
        if (entity.hp <= 0) continue;
        if (
          !state.visible.has(idxFor(entity.gridX, entity.gridY, state.mapWidth))
        ) {
          continue;
        }

        const dx = entity.worldX - player.worldX;
        const dy = entity.worldY - player.worldY;
        const distSq = dx * dx + dy * dy;
        if (distSq > sightPxSq) continue;

        const proximity = 1 - Math.sqrt(distSq) / sightPx;
        const alerted = (entity.alertLevel ?? 0) > 10;
        const threat = proximity * (alerted ? 1.0 : 0.5);
        if (threat > maxThreat) maxThreat = threat;
      } else if (entity.kind === EntityKind.BULLET) {
        if (entity.ownerId === player.id) continue;
        const dx = entity.worldX - player.worldX;
        const dy = entity.worldY - player.worldY;
        if (dx * dx + dy * dy < bulletDangerSq) {
          maxThreat = Math.max(maxThreat, 0.95);
        }
      }
    }

    return Math.min(1, maxThreat);
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

    this.showIntroBeforeNewGame();
  }

  private showIntroBeforeNewGame(): void {
    if (this.introStory) return;
    this.cancelAutoMove();
    this.inputHandler.resetKeys();
    this.gameLoop.pause();
    this.introStory = new IntroStory(() => {
      this.introStory = null;
      this.startNewSinglePlayerGame();
      this.gameLoop.resume();
    });
  }

  private startNewSinglePlayerGame(): void {
    this.game.reset(0);

    this.syncGameOverOverlay(false);
    this.reinitializePhysicsForCurrentState();

    this.render(0);
    // Center on player after new game starts
    this.centerOnPlayerSoon(INITIAL_CAMERA_CENTER_DELAY_MS);
    this.lastPlayerHp = this.game.getState().player.hp;
  }

  /**
   * Handle save game
   */
  private handleSave(): void {
    if (this.isOnlineMode()) {
      this.game.addStory("Save is disabled in online multiplayer.");
      this.render(0);
      return;
    }

    this.cancelAutoMove();
    this.inputHandler.resetKeys();
    this.gameMenu.closePauseMenu(true);
    this.saveSlotDialog.open("save").catch(() => {
      this.game.addStory("Unable to open save slots.");
      this.render(0);
    });
  }

  /**
   * Handle load game
   */
  private async handleLoad(): Promise<void> {
    if (this.isOnlineMode()) {
      this.game.addStory("Load is disabled in online multiplayer.");
      this.render(0);
      return;
    }

    this.cancelAutoMove();
    this.inputHandler.resetKeys();
    this.gameMenu.closePauseMenu(true);
    this.saveSlotDialog.open("load").catch(() => {
      this.game.addStory("Unable to open save slots.");
      this.render(0);
    });
  }

  /**
   * Save the current game to a selected slot.
   */
  private async saveGameToSlot(slot: number): Promise<boolean> {
    try {
      this.render(0);
      const serializedState = this.game.serialize();
      const screenshotDataUrl = await this.renderer.capturePlayerSnapshot(
        this.game.getState(),
        4,
      );
      const record = createSaveSlotRecord(
        slot,
        serializedState,
        screenshotDataUrl,
      );
      await writeSaveSlot(slot, record);
      this.game.addStory(`Game saved to slot ${slot + 1}.`);
      this.render(0);
      return true;
    } catch (error) {
      console.error("Failed to save game:", error);
      this.game.addStory("Save failed.");
      this.render(0);
      return false;
    }
  }

  /**
   * Load game from a selected slot.
   */
  private async loadGameFromSlot(
    slot: number,
    options: { quiet?: boolean } = {},
  ): Promise<boolean> {
    if (this.isOnlineMode()) {
      return false;
    }

    try {
      const record = await readSaveSlot(slot);
      if (!record) return false;
      this.game.deserialize(record.state);
      this.reinitializePhysicsForCurrentState();
      this.syncGameOverOverlay(this.game.getState().player.hp <= 0);
      this.render(0);
      this.centerOnPlayerSoon(LEVEL_TRANSITION_CAMERA_DELAY_MS);
      this.lastPlayerHp = this.game.getState().player.hp;
      if (!options.quiet) {
        this.game.addStory(`Game loaded from slot ${slot + 1}.`);
        this.render(0);
      }
      return true;
    } catch (error) {
      console.error("Failed to load save:", error);
      if (!options.quiet) {
        this.game.addStory("Failed to load game.");
        this.render(0);
      }
      return false;
    }
  }

  private async loadMostRecentGame(
    options: { quiet?: boolean } = {},
  ): Promise<boolean> {
    try {
      const record = await readMostRecentSaveSlot();
      if (!record) return false;
      return this.loadGameFromSlot(record.slot, options);
    } catch (error) {
      console.error("Failed to load save:", error);
      return false;
    }
  }

  private async deleteGameSaveSlot(slot: number): Promise<boolean> {
    try {
      await deleteSaveSlot(slot);
      this.game.addStory(`Deleted save slot ${slot + 1}.`);
      this.render(0);
      return true;
    } catch (error) {
      console.error("Failed to delete save:", error);
      this.game.addStory("Failed to delete save.");
      this.render(0);
      return false;
    }
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
    this.gameMenu.dispose();
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

    this.introStory?.dispose();
    this.introStory = null;
    this.saveSlotDialog.dispose();
    this.characterModal.close();
    this.characterModal.dispose();
    this.inventoryBar.dispose();
  }
}

class MainMenuApp implements DarkWarApplication {
  private readonly gameMenu: GameMenu;
  private readonly saveSlotDialog: SaveSlotDialog;
  private readonly backdrop: HTMLElement;
  private introStory: IntroStory | null = null;
  private preferences: UserPreferences;
  private continueEnabled = false;
  private disposed = false;

  // Multiplayer state
  private mpClient: MultiplayerClient | null = null;
  private mpIsHosting = false;
  private mpPlayerName = "Player";
  private mpGameName = "Dark War";

  constructor(
    private readonly startGame: (
      mode: InitialGameMode,
      loadSlot?: number,
    ) => void,
    private readonly startOnlineGame: (
      client: MultiplayerClient,
      playerName: string,
    ) => void,
  ) {
    this.preferences = loadPreferences();
    this.applyPreferences();

    this.backdrop = document.createElement("div");
    this.backdrop.className = "main-menu-backdrop";
    this.backdrop.style.setProperty(
      "--main-menu-art",
      'url("../img/main.png")',
    );
    document.body.appendChild(this.backdrop);
    document.body.classList.add("main-menu-active");

    this.gameMenu = new GameMenu({
      pausesGame: false,
      allowPauseMenuClose: false,
      canContinue: false,
      mainMenuPresentation: true,
      preferences: this.preferences,
      onPreferencesChange: (preferences) =>
        this.handlePreferencesChange(preferences),
      onNewGame: () => this.launchGame("new"),
      onContinue: () => this.openLoadDialog(),
      onQuit: () => this.handleQuit(),
      // Multiplayer callbacks
      onMultiplayerHost: (gameName, playerName) =>
        this.handleMultiplayerHost(gameName, playerName),
      onMultiplayerJoin: (ip, port, playerName) =>
        this.handleMultiplayerJoin(ip, port, playerName),
      onMultiplayerStartGame: () => this.handleMultiplayerStartGame(),
      onMultiplayerLeaveLobby: () => this.handleMultiplayerLeave(),
      onMultiplayerGetServers: () => this.handleGetServers(),
      onMultiplayerStartDiscovery: () => this.handleStartDiscovery(),
      onMultiplayerStopDiscovery: () => this.handleStopDiscovery(),
    });
    this.saveSlotDialog = new SaveSlotDialog({
      onOpenChange: (isOpen) => {
        if (!isOpen && !this.disposed) {
          this.gameMenu.openPauseMenu();
        }
      },
      onLoadSlot: (slot) => {
        if (this.disposed) return Promise.resolve(false);
        this.startGame("load", slot);
        return Promise.resolve(true);
      },
      onDeleteSlot: async (slot) => {
        await deleteSaveSlot(slot);
        await this.refreshContinueEnabled();
        return true;
      },
    });

    this.setupNativeMenuHandlers();
    Music.setScene("main-menu");
    Music.play();
    this.gameMenu.openPauseMenu();
    this.refreshContinueEnabled().catch(() => {});
  }

  // ── Multiplayer handlers ───────────────────────────────────────────────────────

  private async handleMultiplayerHost(
    gameName: string,
    playerName: string,
  ): Promise<void> {
    if (this.disposed) return;
    this.mpGameName = gameName;
    this.mpPlayerName = playerName;
    this.mpIsHosting = true;

    try {
      // Start embedded server
      const result = await window.native?.serverStart(7777);
      if (!result?.ok) {
        this.gameMenu.setMultiplayerStatusMessage(
          `Failed to start server: ${result?.error ?? "Unknown error"}`,
        );
        return;
      }

      const port = result.port ?? 7777;

      // Start UDP broadcast so others can discover us
      const localIps = (await window.native?.serverGetLocalIps()) ?? [];
      await window.native?.discoveryStartBroadcast({
        name: gameName,
        host: playerName,
        wsPort: port,
        players: 0,
        maxPlayers: 4,
        phase: "lobby",
      });

      // Connect as first player
      this.connectMultiplayerClient(
        `ws://127.0.0.1:${port}`,
        "default",
        playerName,
      );
      this.gameMenu.setMultiplayerConnectionState("connecting");
      void localIps; // used by broadcast above
    } catch (err) {
      this.gameMenu.setMultiplayerStatusMessage(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.mpIsHosting = false;
    }
  }

  private handleMultiplayerJoin(
    ip: string,
    port: number,
    playerName: string,
  ): void {
    if (this.disposed) return;
    this.mpPlayerName = playerName;
    this.mpIsHosting = false;
    this.connectMultiplayerClient(`ws://${ip}:${port}`, "default", playerName);
    this.gameMenu.setMultiplayerConnectionState("connecting");
  }

  private handleMultiplayerStartGame(): void {
    this.mpClient?.requestStartGame();
  }

  private async handleMultiplayerLeave(): Promise<void> {
    if (this.mpClient) {
      this.mpClient.disconnect();
      this.mpClient = null;
    }

    if (this.mpIsHosting) {
      this.mpIsHosting = false;
      await window.native?.discoveryStopBroadcast();
      await window.native?.serverStop();
    }

    this.gameMenu.setMultiplayerConnectionState("disconnected");
  }

  private async handleGetServers(): Promise<DiscoveredServer[]> {
    try {
      return (await window.native?.discoveryGetServers()) ?? [];
    } catch {
      return [];
    }
  }

  private handleStartDiscovery(): void {
    window.native?.discoveryStartListen().catch(() => {});
  }

  private handleStopDiscovery(): void {
    window.native?.discoveryStopListen().catch(() => {});
  }

  private connectMultiplayerClient(
    serverUrl: string,
    roomId: string,
    playerName: string,
  ): void {
    // Disconnect any existing client
    if (this.mpClient) {
      this.mpClient.disconnect();
    }

    const client = new MultiplayerClient(serverUrl, roomId, playerName);

    client.onConnected((_playerId, _roomId, isHost) => {
      if (this.disposed) {
        client.disconnect();
        return;
      }
      this.gameMenu.setMultiplayerConnectionState("lobby");
      this.gameMenu.setPlayerName(playerName);
      void isHost;
    });

    client.onLobbyUpdate((update) => {
      if (this.disposed) return;
      const myId = client.getLocalPlayerId();
      const isHost = update.players.find((p) => p.id === myId)?.isHost ?? false;

      // Update discovery broadcast with current player count
      if (this.mpIsHosting) {
        window.native
          ?.discoveryUpdateBroadcast({
            players: update.players.length,
            phase: update.phase,
          })
          .catch(() => {});
      }

      this.gameMenu.updateLobbyState(update.players, isHost, update.phase);

      // If game started, transition to online play
      if (update.phase === "playing") {
        this.launchOnlineGame(client);
      }
    });

    client.onDisconnected(() => {
      if (this.disposed) return;
      if (this.mpClient === client) {
        this.mpClient = null;
        this.gameMenu.setMultiplayerConnectionState("disconnected");
        this.gameMenu.setMultiplayerStatusMessage("Disconnected from server.");
      }
    });

    client.onError((message) => {
      if (this.disposed) return;
      this.gameMenu.setMultiplayerStatusMessage(message);
    });

    this.mpClient = client;
    client.connect();
  }

  private launchOnlineGame(client: MultiplayerClient): void {
    if (this.disposed) return;
    const playerName = this.mpPlayerName;
    // Stop discovery listening (we're in a game now)
    window.native?.discoveryStopListen().catch(() => {});
    // Null these out BEFORE startOnlineGame calls dispose() on us.
    // dispose() would otherwise disconnect the client and stop the server,
    // but DarkWar needs both to keep running.
    this.mpClient = null;
    this.mpIsHosting = false;
    this.startOnlineGame(client, playerName);
  }

  // ── Standard handlers ────────────────────────────────────────────────────────

  private setupNativeMenuHandlers(): void {
    window.native?.onNewGame?.(() => {
      if (!this.disposed) this.launchGame("new");
    });
    window.native?.onLoadGame?.(() => {
      if (!this.disposed && this.continueEnabled) this.openLoadDialog();
    });
    window.native?.onSoundSettings?.(() => {
      if (!this.disposed) this.gameMenu.openSoundDialog();
    });
    window.native?.onAbout?.(() => {
      if (!this.disposed) this.gameMenu.openAboutDialog();
    });
    window.native?.onAboutGame?.(() => {
      if (!this.disposed) this.gameMenu.openAboutDialog();
    });
  }

  private handlePreferencesChange(preferences: UserPreferences): void {
    this.preferences = {
      ...preferences,
      keyBindings: { ...preferences.keyBindings },
    };
    savePreferences(this.preferences);
    this.applyPreferences();
  }

  private applyPreferences(): void {
    Sound.setVolume(this.preferences.sfxVolume);
    Music.setVolume(this.preferences.musicVolume);
    document.documentElement.dataset.theme = this.preferences.theme;
    window.native
      ?.setDevToolsEnabled(this.preferences.devTools)
      .catch(() => {});
  }

  private async refreshContinueEnabled(): Promise<void> {
    const hasSave = await this.hasSavedGame();
    if (this.disposed) return;
    this.continueEnabled = hasSave;
    this.gameMenu.setContinueEnabled(hasSave);
  }

  private async hasSavedGame(): Promise<boolean> {
    try {
      return await hasSavedGame();
    } catch {
      return false;
    }
  }

  private openLoadDialog(): void {
    if (!this.continueEnabled) return;
    this.gameMenu.closePauseMenu(true);
    this.saveSlotDialog.open("load").catch(() => {});
  }

  private launchGame(mode: InitialGameMode): void {
    if (this.disposed) return;
    if (mode === "load" && !this.continueEnabled) return;
    if (mode === "new") {
      this.showIntroBeforeLaunch();
      return;
    }
    this.openLoadDialog();
  }

  private showIntroBeforeLaunch(): void {
    if (this.introStory) return;
    this.introStory = new IntroStory(() => {
      this.introStory = null;
      if (this.disposed) return;
      this.startGame("new");
    });
  }

  private handleQuit(): void {
    if (window.native?.closeWindow) {
      window.native.closeWindow();
      return;
    }
    window.close();
  }

  public dispose(): void {
    this.disposed = true;
    if (this.mpClient) {
      this.mpClient.disconnect();
      this.mpClient = null;
    }
    if (this.mpIsHosting) {
      window.native?.discoveryStopBroadcast().catch(() => {});
      window.native?.serverStop().catch(() => {});
      this.mpIsHosting = false;
    }
    window.native?.discoveryStopListen().catch(() => {});
    this.introStory?.dispose();
    this.introStory = null;
    this.saveSlotDialog.dispose();
    this.gameMenu.dispose();
    this.backdrop.remove();
    document.body.classList.remove("main-menu-active");
  }
}

// Initialize game when DOM is ready
const createDarkWarApp = (): void => {
  window.darkWarApp?.dispose();

  const savedPreferences = loadPreferences();
  Sound.setVolume(savedPreferences.sfxVolume);
  Music.setVolume(savedPreferences.musicVolume);

  // Kick off asset loading in the background while title screen is showing
  Sound.preload().catch(() => {});
  Music.load().catch(() => {});
  const retroWindowChrome = new RetroWindowChrome();

  // Show the title screen first — nothing else initialises until dismissed.
  // Both html and body get the class so both transparent overrides fire.
  const shouldSkipTitle = new URLSearchParams(window.location.search).has(
    "skipTitle",
  );
  const shouldShowMenu = new URLSearchParams(window.location.search).has(
    "showMenu",
  );

  const startGame = (
    mode: InitialGameMode = "new",
    loadSlot?: number,
  ): void => {
    window.darkWarApp?.dispose();
    Music.setScene("outside-peaceful");
    Music.play();
    window.darkWarApp = new DarkWar({
      initialGame: mode,
      initialLoadSlot: loadSlot,
    });
  };

  const startOnlineGame = (
    client: MultiplayerClient,
    playerName: string,
  ): void => {
    window.darkWarApp?.dispose();
    Music.setScene("outside-peaceful");
    Music.play();
    window.darkWarApp = new DarkWar({ multiplayerClient: client, playerName });
  };

  const showMainMenu = (): void => {
    window.darkWarApp?.dispose();
    window.darkWarApp = new MainMenuApp(startGame, startOnlineGame);
  };

  if (shouldSkipTitle) {
    document.documentElement.classList.remove("title-screen-active");
    document.body.classList.remove("title-screen-active");
    retroWindowChrome.showGameChrome();
    if (shouldShowMenu) {
      showMainMenu();
    } else {
      startGame("new");
    }
    return;
  }

  document.documentElement.classList.add("title-screen-active");
  document.body.classList.add("title-screen-active");
  new TitleScreen(() => {
    retroWindowChrome.transitionFromIntro().then((didCreateGameWindow) => {
      if (didCreateGameWindow) return;
      showMainMenu();
    });
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    createDarkWarApp();
  });
} else {
  createDarkWarApp();
}
