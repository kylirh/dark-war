/**
 * Dark War - Main Entry Point
 * Modern roguelike remake of Mission Thunderbolt
 */

import { Game } from "./core/Game";
import { Renderer } from "./systems/Renderer";
import { UI } from "./systems/UI";
import { InputHandler, InputCallbacks } from "./systems/Input";
import { Sound } from "./systems/Sound";
import {
  enqueueCommand,
  stepSimulationTick,
  SIM_DT_MS,
} from "./systems/Simulation";
import { CommandType, EntityKind, MAP_WIDTH, TileType, CELL_CONFIG } from "./types";
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
  private renderer: Renderer;
  private ui: UI;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private inputHandler: InputHandler;
  private rafId?: number;
  private playerActedThisTick: boolean = false;
  private autoMovePath: [number, number][] | null = null;

  constructor() {
    this.game = new Game();
    this.renderer = new Renderer("game");
    this.ui = new UI();

    // Preload sounds
    this.initializeSounds();

    // Setup input callbacks
    const callbacks: InputCallbacks = {
      onMove: (dx, dy) => this.handleMove(dx, dy),
      onFire: (dx, dy) => this.handleFire(dx, dy),
      onInteract: (dx, dy) => this.handleInteract(dx, dy),
      onPickup: () => this.handlePickup(),
      onWait: () => this.handleWait(),
      onReload: () => this.handleReload(),
      onDescend: () => this.handleDescend(),
      onToggleFOV: () => this.handleToggleFOV(),
      onToggleMode: () => this.handleToggleMode(),
      onTogglePause: () => this.handleTogglePause(),
      onResumePause: (reason) => this.game.resumeFromPause(reason),
      onNewGame: () => this.handleNewGame(),
      onSave: () => this.handleSave(),
      onLoad: () => this.handleLoad(),
    };

    this.inputHandler = new InputHandler(callbacks);

    // Setup click-to-move
    this.setupClickToMove();

    // Setup native menu handlers for Electron
    this.setupNativeMenuHandlers();

    // Try to load saved game, otherwise start new
    if (!this.loadGame()) {
      this.game.reset(1);
    }

    this.render();
    // Center on player initially (after first render)
    setTimeout(() => {
      const state = this.game.getState();
      this.renderer.centerOnPlayer(state.player, false);
    }, 100);
    this.startRenderLoop();
  }

  /**
   * Initialize and preload sound effects
   */
  private async initializeSounds(): Promise<void> {
    try {
      await Sound.preload();
      console.log("Sound effects loaded");
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
        state.entities
      );

      if (path && path.length > 1) {
        // Store path for auto-movement (skip first element which is current position)
        this.autoMovePath = path.slice(1);
      }
    });
  }

  /**
   * Start the render loop (decoupled from simulation)
   */
  private startRenderLoop(): void {
    const loop = (now: number) => {
      const state = this.game.getState();
      const dt = now - state.sim.lastFrameMs;
      state.sim.lastFrameMs = now;

      // Process auto-move in Planning mode only
      if (state.sim.mode === "PLANNING" && !state.sim.isPaused && this.autoMovePath && this.autoMovePath.length > 0) {
        // Check if there are no queued commands
        const hasQueuedCommands = state.commandsByTick.size > 0;
        
        if (!hasQueuedCommands) {
          // Store HP before move to detect damage
          const hpBefore = state.player.hp;
          
          // Get next step
          const nextStep = this.autoMovePath[0];
          const dx = nextStep[0] - state.player.x;
          const dy = nextStep[1] - state.player.y;
          
          // Try to move to next step (pass true to indicate this is auto-move)
          this.handleMove(dx, dy, true);
          
          // Check if player took damage or died - cancel auto-move
          const hpAfter = state.player.hp;
          if (hpAfter < hpBefore) {
            this.cancelAutoMove();
          } else {
            // Only advance path if no damage taken
            // Remove this step from path
            this.autoMovePath.shift();
            
            // Clear path if we've reached destination or if move failed
            if (this.autoMovePath.length === 0) {
              this.autoMovePath = null;
            }
          }
        } else {
          // Commands are still being processed, wait
        }
      }

      // Real-time mode: advance simulation based on accumulated time
      if (state.sim.mode === "REALTIME" && !state.sim.isPaused) {
        state.sim.accumulatorMs += dt;

        while (state.sim.accumulatorMs >= SIM_DT_MS) {
          stepSimulationTick(state);
          state.sim.accumulatorMs -= SIM_DT_MS;

          // Update FOV after tick
          this.game.updateFOV();

          // Check for descend flag
          if ((state as any)._shouldDescend) {
            (state as any)._shouldDescend = false;
            this.game.descend();
            // Center on player after level transition
            setTimeout(() => {
              const newState = this.game.getState();
              this.renderer.centerOnPlayer(newState.player, false);
            }, 50);
          }
        }
      }

      this.render();
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Cancel automatic movement
   */
  private cancelAutoMove(): void {
    this.autoMovePath = null;
  }

  /**
   * Handle player movement
   */
  private handleMove(dx: number, dy: number, fromAutoMove: boolean = false): void {
    // Only cancel auto-move if this is a manual action
    if (!fromAutoMove) {
      this.cancelAutoMove();
    }

    const state = this.game.getState();
    const playerId = state.player.id;
    const player = state.player;

    // In Planning mode, validate move before enqueueing to avoid consuming turn
    if (state.sim.mode === "PLANNING") {
      const nx = player.x + dx;
      const ny = player.y + dy;

      // Check bounds
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= 36) return;

      // Check if tile is passable
      const idx = nx + ny * MAP_WIDTH;
      const tile = state.map[idx];
      if (
        tile === TileType.WALL ||
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_LOCKED
      )
        return;

      // Check entity blocking (except monsters which trigger attack)
      const blocker = state.entities.find(
        (e) => e.x === nx && e.y === ny && e.kind === EntityKind.PLAYER
      );
      if (blocker) return;
    }

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.MOVE,
      data: { type: "MOVE", dx, dy },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();

      // Check for descend flag
      if ((state as any)._shouldDescend) {
        (state as any)._shouldDescend = false;
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
   * Handle firing weapon
   */
  private handleFire(dx: number, dy: number): void {
    this.cancelAutoMove();

    // If dx=0 and dy=0, this is just entering fire mode, not actually firing
    if (dx === 0 && dy === 0) {
      this.game.addLog("Choose a direction to fire.");
      return;
    }

    const state = this.game.getState();
    const playerId = state.player.id;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx, dy },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();

      if ((state as any)._shouldDescend) {
        (state as any)._shouldDescend = false;
        this.game.descend();
      }
    }

    this.autoSave();
  }

  /**
   * Handle wait/rest
   */
  private handleWait(): void {
    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();
    }

    this.autoSave();
  }

  /**
   * Handle door interaction
   */
  private handleInteract(dx: number, dy: number): void {
    this.cancelAutoMove();

    // Show prompt if no direction given
    if (dx === 0 && dy === 0) {
      this.game.addLog("Which direction?");
      return;
    }

    const state = this.game.getState();
    const playerId = state.player.id;
    const player = state.player;

    const targetX = player.x + dx;
    const targetY = player.y + dy;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.INTERACT,
      data: { type: "INTERACT", x: targetX, y: targetY },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();
    }

    this.autoSave();
  }

  /**
   * Handle pickup items
   */
  private handlePickup(): void {
    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.PICKUP,
      data: { type: "PICKUP" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();
    }

    this.autoSave();
  }

  /**
   * Handle reload
   */
  private handleReload(): void {
    this.cancelAutoMove();

    const state = this.game.getState();
    const playerId = state.player.id;

    const tick =
      state.sim.mode === "PLANNING" ? state.sim.nowTick : state.sim.nowTick + 1;

    enqueueCommand(state, {
      tick,
      actorId: playerId,
      type: CommandType.RELOAD,
      data: { type: "RELOAD" },
      priority: 0,
      source: "PLAYER",
    });

    this.playerActedThisTick = true;

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();
    }

    this.autoSave();
  }

  /**
   * Handle descending stairs
   */
  private handleDescend(): void {
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

      if ((state as any)._shouldDescend) {
        (state as any)._shouldDescend = false;
        this.game.descend();
        // Center on player after level transition
        setTimeout(() => {
          const newState = this.game.getState();
          this.renderer.centerOnPlayer(newState.player, false);
        }, 50);
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
   * Handle mode toggle (Planning <-> Real-Time)
   */
  private handleToggleMode(): void {
    this.game.toggleMode();
  }

  /**
   * Handle pause toggle
   */
  private handleTogglePause(): void {
    this.game.togglePause();
  }

  /**
   * Handle new game
   */
  private handleNewGame(): void {
    this.game.reset(1);
    this.render();
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
          this.render();
        } else {
          this.game.addLog("Save failed.");
          this.render();
        }
      });
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem("darkwar-save", saveData);
        this.game.addLog("Game saved.");
        this.render();
      } catch (e) {
        this.game.addLog("Save failed.");
        this.render();
      }
    }
  }

  /**
   * Handle load game
   */
  private handleLoad(): void {
    if (this.loadGame()) {
      this.game.addLog("Game loaded.");
      this.render();
    } else {
      this.game.addLog("No save found.");
      this.render();
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
        return true;
      }
    } catch (e) {
      console.error("Failed to load save:", e);
    }

    return false;
  }

  /**
   * Render everything
   */
  private render(): void {
    const state = this.game.getState();
    const isDead = this.game.isPlayerDead();

    this.renderer.render(state, isDead);
    this.ui.updateAll(state.player, state.depth, state.log, state.sim);

    // Center on player if they acted this tick
    if (this.playerActedThisTick) {
      this.renderer.centerOnPlayer(state.player, true);
      this.playerActedThisTick = false;
    }
  }

  /**
   * Set the rendering scale
   */
  public setScale(scale: number): void {
    this.renderer.setScale(scale);
    const state = this.game.getState();
    this.renderer.render(state, this.game.isPlayerDead());
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
