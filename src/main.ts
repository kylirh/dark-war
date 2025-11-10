/**
 * Dark War - Main Entry Point
 * Modern roguelike remake of Mission Thunderbolt
 */

import { Game } from "./core/Game";
import { Renderer } from "./systems/Renderer";
import { UI } from "./systems/UI";
import { InputHandler, InputCallbacks } from "./systems/Input";

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
  // Keep reference to prevent garbage collection
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private inputHandler: InputHandler;

  constructor() {
    this.game = new Game();
    this.renderer = new Renderer("game");
    this.ui = new UI();

    // Setup input callbacks
    const callbacks: InputCallbacks = {
      onMove: (dx, dy) => this.handleMove(dx, dy),
      onFire: (dx, dy) => this.handleFire(dx, dy),
      onWait: () => this.handleWait(),
      onPickup: () => this.handlePickup(),
      onInteract: () => this.handleInteract(),
      onDescend: () => this.handleDescend(),
      onReload: () => this.handleReload(),
      onToggleFOV: () => this.handleToggleFOV(),
      onNewGame: () => this.handleNewGame(),
      onSave: () => this.handleSave(),
      onLoad: () => this.handleLoad(),
    };

    this.inputHandler = new InputHandler(callbacks);

    // Setup native menu handlers (Electron)
    this.setupNativeMenuHandlers();

    // Try to load saved game, otherwise start new
    if (!this.loadGame()) {
      this.game.reset(1);
    }

    this.render();
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
   * Handle player movement
   */
  private handleMove(dx: number, dy: number): void {
    this.game.handleMove(dx, dy);
    this.render();
    this.autoSave();
  }

  /**
   * Handle firing weapon
   */
  private handleFire(dx: number, dy: number): void {
    this.game.handleFire(dx, dy);
    this.render();
    if (dx !== 0 || dy !== 0) {
      this.autoSave();
    }
  }

  /**
   * Handle wait/rest
   */
  private handleWait(): void {
    this.game.handleWait();
    this.render();
    this.autoSave();
  }

  /**
   * Handle pickup
   */
  private handlePickup(): void {
    this.game.handlePickup();
    this.render();
  }

  /**
   * Handle door interaction
   */
  private handleInteract(): void {
    this.game.handleInteract();
    this.render();
    this.autoSave();
  }

  /**
   * Handle descending stairs
   */
  private handleDescend(): void {
    this.game.handleDescend();
    this.render();
    this.autoSave();
  }

  /**
   * Handle reload
   */
  private handleReload(): void {
    this.game.handleReload();
    this.render();
  }

  /**
   * Handle FOV toggle
   */
  private handleToggleFOV(): void {
    this.game.toggleFOV();
    this.render();
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
    this.ui.updateAll(state.player, state.depth, state.log);
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
