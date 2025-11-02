/**
 * Input handling and keyboard controls
 */

export type Direction = [number, number];

export interface InputCallbacks {
  onMove: (dx: number, dy: number) => void;
  onFire: (dx: number, dy: number) => void;
  onWait: () => void;
  onPickup: () => void;
  onInteract: () => void;
  onDescend: () => void;
  onReload: () => void;
  onToggleFOV: () => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
}

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

export class InputHandler {
  private callbacks: InputCallbacks;
  private fireMode = false;

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key;

    // Directional movement or firing
    if (key in DIRECTION_KEYS) {
      e.preventDefault();
      const [dx, dy] = DIRECTION_KEYS[key];

      if (this.fireMode) {
        this.fireMode = false;
        this.callbacks.onFire(dx, dy);
      } else {
        this.callbacks.onMove(dx, dy);
      }
      return;
    }

    // Wait/skip turn
    if (key === ".") {
      e.preventDefault();
      this.callbacks.onWait();
      return;
    }

    // Pickup items
    if (key === "g" || key === "G") {
      e.preventDefault();
      this.callbacks.onPickup();
      return;
    }

    // Open/close doors
    if (key === "o" || key === "O") {
      e.preventDefault();
      this.callbacks.onInteract();
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
  }

  public isInFireMode(): boolean {
    return this.fireMode;
  }

  public cancelFireMode(): void {
    this.fireMode = false;
  }
}
