/**
 * Input handling and keyboard controls
 */

export type Direction = [number, number];

export interface InputCallbacks {
  onMove: (dx: number, dy: number) => void;
  onFire: (dx: number, dy: number) => void;
  onInteract: (dx: number, dy: number) => void;
  onPickup: () => void;
  onWait: () => void;
  onReload: () => void;
  onDescend: () => void;
  onToggleFOV: () => void;
  onToggleMode: () => void;
  onTogglePause: () => void;
  onResumePause: (reason: string) => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
}

const DIRECTION_KEYS: Record<string, Direction> = {
  Numpad7: [-1, -1], // up-left
  Numpad8: [0, -1], // up
  Numpad9: [1, -1], // up-right
  Numpad4: [-1, 0], // left
  Numpad6: [1, 0], // right
  Numpad1: [-1, 1], // down-left
  Numpad2: [0, 1], // down
  Numpad3: [1, 1], // down-right
};

export class InputHandler {
  private callbacks: InputCallbacks;
  private fireMode = false;
  private interactMode = false;

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key;
    const code = e.code;

    // Directional movement, firing, or interacting
    if (code in DIRECTION_KEYS) {
      e.preventDefault();
      const [dx, dy] = DIRECTION_KEYS[code];

      if (this.fireMode) {
        this.fireMode = false;
        this.callbacks.onFire(dx, dy);
      } else if (this.interactMode) {
        this.interactMode = false;
        this.callbacks.onInteract(dx, dy);
      } else {
        this.callbacks.onMove(dx, dy);
      }
      return;
    }

    // Wait/skip turn
    if (code === "Numpad5") {
      e.preventDefault();
      this.callbacks.onWait();
      return;
    }

    // Descend stairs
    if (key === "<") {
      e.preventDefault();
      this.callbacks.onDescend();
      return;
    }

    // Enter fire mode
    if (key === "f" || key === "F") {
      e.preventDefault();
      this.fireMode = true;
      this.callbacks.onFire(0, 0); // Signal to show fire prompt
      return;
    }

    // Enter interact mode (open/close doors)
    if (key === "o" || key === "O") {
      e.preventDefault();
      this.interactMode = true;
      this.callbacks.onInteract(0, 0); // Signal to show interact prompt
      return;
    }
    // Pick up items
    if (key === "g" || key === "G") {
      e.preventDefault();
      this.callbacks.onPickup();
      return;
    }
    // Reload weapon
    if (key === "r" || key === "R") {
      e.preventDefault();
      this.callbacks.onReload();
      return;
    }

    // Toggle FOV
    if (key === "v" || key === "V") {
      e.preventDefault();
      this.callbacks.onToggleFOV();
      return;
    }

    // Toggle mode (Planning <-> Real-Time)
    if (key === "p" || key === "P") {
      e.preventDefault();
      this.callbacks.onToggleMode();
      return;
    }

    // Toggle pause (Space)
    if (key === " ") {
      e.preventDefault();
      this.callbacks.onTogglePause();
      return;
    }

    // Resume from pause (Enter)
    if (key === "Enter") {
      e.preventDefault();
      this.callbacks.onResumePause("npc_talk");
      this.callbacks.onResumePause("player_death");
      return;
    }
  }

  public isInFireMode(): boolean {
    return this.fireMode;
  }

  public cancelFireMode(): void {
    this.fireMode = false;
  }
}
