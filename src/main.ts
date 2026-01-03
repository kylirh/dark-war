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
import { CommandType, EntityKind } from "./types";

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

    // Setup native menu handlers for Electron
    this.setupNativeMenuHandlers();

    // Try to load saved game, otherwise start new
    if (!this.loadGame()) {
      this.game.reset(1);
    }

    this.render();
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
   * Start the render loop (decoupled from simulation)
   */
  private startRenderLoop(): void {
    const loop = (now: number) => {
      const state = this.game.getState();
      const dt = now - state.sim.lastFrameMs;
      state.sim.lastFrameMs = now;

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
          }
        }
      }

      this.render();
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Handle player movement
   */
  private handleMove(dx: number, dy: number): void {
    const state = this.game.getState();
    const playerId = state.player.id;

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

    if (state.sim.mode === "PLANNING") {
      stepSimulationTick(state);
      this.game.updateFOV();

      // Check for descend flag
      if ((state as any)._shouldDescend) {
        (state as any)._shouldDescend = false;
        this.game.descend();
      }
    }

    this.autoSave();
  }

  /**
   * Handle firing weapon
   */
  private handleFire(dx: number, dy: number): void {
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
  }
}

// Initialize game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new DarkWar();
  });
} else {
  new DarkWar();
}
