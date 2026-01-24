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

// Debug configuration - set to true to enable performance logging
const DEBUG = false;

// Mouse wheel throttling constants
const WHEEL_THROTTLE_MS = 150; // Minimum time between weapon switches (ms)
const WHEEL_DELTA_THRESHOLD = 30; // Minimum accumulated deltaY to trigger switch

import { Game } from "./core/Game";
import { GameLoop } from "./core/GameLoop";
import { Renderer } from "./systems/Renderer";
import { Physics } from "./systems/Physics";
import { MouseTracker } from "./systems/MouseTracker";
import { UI } from "./systems/UI";
import { InputHandler, InputCallbacks } from "./systems/Input";
import { Sound } from "./systems/Sound";
import {
  enqueueCommand,
  stepSimulationTick,
  SIM_DT_MS,
} from "./systems/Simulation";
import {
  CommandType,
  EntityKind,
  MAP_WIDTH,
  TileType,
  CELL_CONFIG,
  SLOWMO_SCALE,
  REAL_TIME_SPEED,
  TIME_SCALE_TRANSITION_SPEED,
  WeaponType,
} from "./types";
import { findPath } from "./utils/pathfinding";
import { idx } from "./utils/helpers";

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
 * Main game application
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
  private realTimeToggled: boolean = false; // Track if Enter key toggled real-time mode
  private lastWheelTime: number = 0; // Track last weapon cycle time
  private wheelDeltaAccumulator: number = 0; // Accumulate wheel delta

  constructor() {
    if (DEBUG) console.time("Game initialization");
    if (DEBUG) console.time("Create Game instance");
    this.game = new Game();
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
      onDescend: () => this.handleDescend(),
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
    const newGameButton = document.getElementById("new-game-button");
    if (newGameButton) {
      newGameButton.addEventListener("click", () => this.handleNewGame());
    }

    // Setup native menu handlers for Electron
    this.setupNativeMenuHandlers();

    // Try to load saved game, otherwise start new
    if (DEBUG) console.time("Load or start game");
    // Skip localStorage on initial load (slow in Electron)
    // User can explicitly load via menu if save exists
    this.game.reset(1);
    if (DEBUG) console.timeEnd("Load or start game");

    if (DEBUG) console.time("First render");
    this.render(0);
    if (DEBUG) console.timeEnd("First render");

    // Initialize physics for current map
    const initialState = this.game.getState();
    this.physics.initializeMap(initialState.map);

    // Initialize physics bodies for all entities
    for (const entity of initialState.entities) {
      this.physics.updateEntityBody(entity as any);
    }

    // Center on player initially (after first render)
    setTimeout(() => {
      const state = this.game.getState();
      this.renderer.centerOnPlayer(state.player, false);
    }, 100);

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

  /**
   * Setup click-to-move functionality
   */
  private setupClickToMove(): void {
    const canvas = document.getElementById("game") as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas not found for click-to-move");
      return;
    }

    canvas.style.cursor = "pointer";

    // Left click: move
    canvas.addEventListener("click", (event) => {
      const state = this.game.getState();
      const scale = this.renderer.getScale();

      // Get canvas bounding rect
      const rect = canvas.getBoundingClientRect();

      // Convert click coordinates to canvas coordinates
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      // Convert to game coordinates (accounting for scale)
      const gameX = canvasX / scale;
      const gameY = canvasY / scale;

      // Convert to tile coordinates (accounting for padding)
      const tileX = Math.floor((gameX - CELL_CONFIG.padX) / CELL_CONFIG.w);
      const tileY = Math.floor((gameY - CELL_CONFIG.padY) / CELL_CONFIG.h);

      // Check if tile is valid and explored
      const tileIdx = idx(tileX, tileY);
      if (!state.explored.has(tileIdx)) {
        return; // Not explored, ignore click
      }

      // Find path to clicked tile
      const path = findPath(
        state.player.x,
        state.player.y,
        tileX,
        tileY,
        state.map,
        state.explored,
        state.entities,
      );

      if (path && path.length > 1) {
        // Store path for auto-movement (skip first element which is current position)
        this.autoMovePath = path.slice(1);
      }
    });

    // Right click or Shift+Click: shoot
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.handleMouseFire(event);
    });

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();

        const now = performance.now();
        const timeSinceLastSwitch = now - this.lastWheelTime;

        // Accumulate wheel delta
        this.wheelDeltaAccumulator += event.deltaY;

        // Only switch weapon if enough time has passed AND enough delta accumulated
        if (
          timeSinceLastSwitch >= WHEEL_THROTTLE_MS &&
          Math.abs(this.wheelDeltaAccumulator) >= WHEEL_DELTA_THRESHOLD
        ) {
          const direction = this.wheelDeltaAccumulator > 0 ? 1 : -1;
          this.handleCycleWeapon(direction);
          this.lastWheelTime = now;
          this.wheelDeltaAccumulator = 0; // Reset accumulator after switch
        }
      },
      { passive: false },
    );
  }

  /**
   * Handle mouse-based firing
   */
  private handleMouseFire(event: MouseEvent): void {
    // Fire with mouse aiming (dx/dy will be ignored)
    this.handleFire(0, 0);
  }

  /**
   * Update game logic at fixed timestep (called by GameLoop)
   */
  private update(dt: number): void {
    const state = this.game.getState();
    const isDead = this.game.isPlayerDead();

    // Update mouse tracker with current camera position and scale
    const cameraPos = this.renderer.getCameraPosition();
    this.mouseTracker.setCameraPosition(cameraPos.x, cameraPos.y);
    this.mouseTracker.setScale(this.renderer.getScale());

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

    // Advance simulation ticks with time scaling
    state.sim.accumulatorMs += scaledDt * 1000;
    while (state.sim.accumulatorMs >= SIM_DT_MS) {
      stepSimulationTick(state);
      state.sim.accumulatorMs -= SIM_DT_MS;
      this.game.updateFOV();
      
      // Check if player died and handle UI
      const playerJustDied = this.game.updateDeathStatus();
      if (playerJustDied) {
        const gameOverOverlay = document.getElementById("game-over-overlay");
        if (gameOverOverlay) {
          gameOverOverlay.classList.add("visible");
        }
      }

      // Check for descend flag
      if (state.shouldDescend) {
        state.shouldDescend = false;
        this.game.descend();

        this.physics.initializeMap(state.map);
        for (const entity of state.entities) {
          this.physics.updateEntityBody(entity as any);
        }

        setTimeout(() => {
          const newState = this.game.getState();
          this.renderer.centerOnPlayer(newState.player, false);
        }, 50);
      }
    }

    // Check if player has stopped moving
    const player = state.player;
    const playerMoving =
      "velocityX" in player && "velocityY" in player
        ? Math.abs((player as any).velocityX) > 0.1 ||
          Math.abs((player as any).velocityY) > 0.1
        : false;

    // Update target time scale based on player movement
    if (isDead) {
      state.sim.targetTimeScale = 1.0;
    }

    if (!playerMoving && !this.playerActedThisTick && !isDead) {
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
    const isDead = this.game.isPlayerDead();

    this.renderer.render(state, isDead, alpha);
    this.ui.updateAll(state.player, state.depth, state.log, state.sim);

    // Center on player smoothly during movement
    this.renderer.centerOnPlayer(state.player, true);
  }

  /**
   * Handle velocity updates from WASD input
   */
  private handleUpdateVelocity(vx: number, vy: number): void {
    const state = this.game.getState();
    const player = state.player;

    // Don't allow movement if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    // Set player velocity directly
    if ("velocityX" in player && "velocityY" in player) {
      (player as any).velocityX = vx;
      (player as any).velocityY = vy;
    }

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
  }

  /**
   * Handle firing weapon
   */
  private handleFire(dx: number, dy: number): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;
    const player = state.player;

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;

    // Set player's facing angle based on mouse position for bullet direction
    if ("worldX" in player && "worldY" in player) {
      const mousePos = this.mouseTracker.getWorldPosition();
      const angle = this.mouseTracker.getAngleFrom(
        (player as any).worldX,
        (player as any).worldY,
      );
      (player as any).facingAngle = angle;
    }

    const tick = state.sim.nowTick;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx, dy },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);
    this.game.updateFOV();

    this.autoSave();
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
    player.weapon = weapons[nextIndex];
    this.game.addLog(`Weapon set: ${player.weapon}.`);
  }

  /**
   * Handle wait/rest
   */
  private handleWait(): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;

    const tick = state.sim.nowTick;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);
    this.game.updateFOV();
    const playerJustDied = this.game.updateDeathStatus();
    if (playerJustDied) {
      const gameOverOverlay = document.getElementById("game-over-overlay");
      if (gameOverOverlay) {
        gameOverOverlay.classList.add("visible");
      }
    }

    this.autoSave();
  }

  /**
   * Handle door interaction
   */
  private handleInteract(dx: number, dy: number): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    // Show prompt if no direction given
    if (dx === 0 && dy === 0) {
      this.game.addLog("Which direction?");
      return;
    }

    const state = this.game.getState();
    const playerId = state.player.id;
    const player = state.player;

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;

    const targetX = player.x + dx;
    const targetY = player.y + dy;

    const tick = state.sim.nowTick;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.INTERACT,
      data: { type: "INTERACT", x: targetX, y: targetY },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);
    this.game.updateFOV();
    const playerJustDied = this.game.updateDeathStatus();
    if (playerJustDied) {
      const gameOverOverlay = document.getElementById("game-over-overlay");
      if (gameOverOverlay) {
        gameOverOverlay.classList.add("visible");
      }
    }

    this.autoSave();
  }

  /**
   * Handle pickup items
   */
  private handlePickup(): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;

    const tick = state.sim.nowTick;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.PICKUP,
      data: { type: "PICKUP" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);
    this.game.updateFOV();
    const playerJustDied = this.game.updateDeathStatus();
    if (playerJustDied) {
      const gameOverOverlay = document.getElementById("game-over-overlay");
      if (gameOverOverlay) {
        gameOverOverlay.classList.add("visible");
      }
    }

    this.autoSave();
  }

  /**
   * Handle reload
   */
  private handleReload(): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    // Resume time when player acts
    state.sim.targetTimeScale = 1.0;

    const tick = state.sim.nowTick;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.RELOAD,
      data: { type: "RELOAD" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    // Execute immediately
    stepSimulationTick(state);
    this.game.updateFOV();
    const playerJustDied = this.game.updateDeathStatus();
    if (playerJustDied) {
      const gameOverOverlay = document.getElementById("game-over-overlay");
      if (gameOverOverlay) {
        gameOverOverlay.classList.add("visible");
      }
    }

    this.autoSave();
  }

  /**
   * Handle descending stairs
   */
  private handleDescend(): void {
    // Don't allow actions if player is dead
    if (this.game.isPlayerDead()) {
      return;
    }

    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.DESCEND,
      data: { type: "DESCEND" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();

      if (state.shouldDescend) {
        state.shouldDescend = false;
        this.game.descend();
        // Center on player after level transition
        setTimeout(() => {
          const newState = this.game.getState();
          this.renderer.centerOnPlayer(newState.player, false);
        }, 50);
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
    this.realTimeToggled = !this.realTimeToggled;
    const state = this.game.getState();
    state.sim.targetTimeScale = this.realTimeToggled ? 1.0 : SLOWMO_SCALE;
  }

  /**
   * Handle new game
   */
  private handleNewGame(): void {
    this.game.reset(1);

    // Hide game over overlay
    const gameOverOverlay = document.getElementById("game-over-overlay");
    if (gameOverOverlay) {
      gameOverOverlay.classList.remove("visible");
    }

    // Reinitialize physics for new level
    const state = this.game.getState();
    this.physics.initializeMap(state.map);
    for (const entity of state.entities) {
      this.physics.updateEntityBody(entity as any);
    }

    this.render(0);
    // Center on player after new game starts
    setTimeout(() => {
      const state = this.game.getState();
      this.renderer.centerOnPlayer(state.player, false);
    }, 100);
    this.autoSave();
  }

  /**
   * Handle save game
   */
  private handleSave(): void {
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
  private handleLoad(): void {
    if (this.loadGame()) {
      this.game.addLog("Game loaded.");

      // Reinitialize physics for loaded level
      const state = this.game.getState();
      this.physics.initializeMap(state.map);
      for (const entity of state.entities) {
        this.physics.updateEntityBody(entity as any);
      }

      this.render(0);
    } else {
      this.game.addLog("No save found.");
      this.render(0);
    }
  }

  /**
   * Auto-save game state
   */
  private autoSave(): void {
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
  private loadGame(): boolean {
    // Try Electron load first
    if (window.native?.saveRead) {
      // This is async, but we'll use localStorage for initial load
      // Electron save will be used for explicit save/load actions
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
    } catch (e) {
      console.error("Failed to load save:", e);
    }

    return false;
  }

  /**
   * Set the rendering scale
   */
  public setScale(scale: number): void {
    this.renderer.setScale(scale);
    const state = this.game.getState();
    this.renderer.render(state, this.game.isPlayerDead(), 0);
    this.renderer.centerOnPlayer(state.player, false);
  }
}

// Initialize game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.darkWarApp = new DarkWar();
  });
} else {
  window.darkWarApp = new DarkWar();
}
