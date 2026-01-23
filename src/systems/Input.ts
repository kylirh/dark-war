/**
 * Input handling and keyboard controls
 * Tracks key states for continuous WASD movement with normalized diagonals
 */

export type Direction = [number, number];

// Movement speed constant
export const MOVEMENT_SPEED = 200; // pixels per second

export interface InputCallbacks {
  onUpdateVelocity: (vx: number, vy: number) => void; // Continuous velocity update
  onFire: (dx: number, dy: number) => void;
  onInteract: (dx: number, dy: number) => void;
  onPickup: () => void;
  onWait: () => void;
  onReload: () => void;
  onDescend: () => void;
  onToggleFOV: () => void;
  onResumePause: (reason: string) => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
}

export class InputHandler {
  private callbacks: InputCallbacks;
  private fireMode = false;
  private interactMode = false;

  // Track WASD key states for continuous movement
  private keysPressed = {
    w: false,
    a: false,
    s: false,
    d: false,
  };

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const code = e.code;

    // Track WASD key states
    if (code === "KeyW") {
      e.preventDefault();
      if (!this.keysPressed.w) {
        this.keysPressed.w = true;
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyA") {
      e.preventDefault();
      if (!this.keysPressed.a) {
        this.keysPressed.a = true;
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyS") {
      e.preventDefault();
      if (!this.keysPressed.s) {
        this.keysPressed.s = true;
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyD") {
      e.preventDefault();
      if (!this.keysPressed.d) {
        this.keysPressed.d = true;
        this.updateVelocity();
      }
      return;
    }

    // Escape key - cancel any active input mode
    if (key === "escape") {
      e.preventDefault();
      if (this.fireMode || this.interactMode) {
        this.fireMode = false;
        this.interactMode = false;
      }
      return;
    }

    // Descend stairs
    if (key === "<") {
      e.preventDefault();
      this.callbacks.onDescend();
      return;
    }

    // Enter interact mode (open/close doors)
    if (key === "o") {
      e.preventDefault();
      this.interactMode = true;
      this.callbacks.onInteract(0, 0); // Signal to show interact prompt
      return;
    }
    
    // Pick up items
    if (key === "g") {
      e.preventDefault();
      this.callbacks.onPickup();
      return;
    }
    
    // Reload weapon
    if (key === "r") {
      e.preventDefault();
      this.callbacks.onReload();
      return;
    }

    // Toggle FOV
    if (key === "v") {
      e.preventDefault();
      this.callbacks.onToggleFOV();
      return;
    }

    // Resume from pause (Enter)
    if (key === "enter") {
      e.preventDefault();
      this.callbacks.onResumePause("npc_talk");
      this.callbacks.onResumePause("player_death");
      return;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const code = e.code;

    // Track WASD key releases
    if (code === "KeyW") {
      e.preventDefault();
      this.keysPressed.w = false;
      this.updateVelocity();
      return;
    }
    if (code === "KeyA") {
      e.preventDefault();
      this.keysPressed.a = false;
      this.updateVelocity();
      return;
    }
    if (code === "KeyS") {
      e.preventDefault();
      this.keysPressed.s = false;
      this.updateVelocity();
      return;
    }
    if (code === "KeyD") {
      e.preventDefault();
      this.keysPressed.d = false;
      this.updateVelocity();
      return;
    }
  }

  /**
   * Calculate and apply normalized velocity from WASD key states
   */
  private updateVelocity(): void {
    let vx = 0;
    let vy = 0;

    // Calculate raw velocity from key states
    if (this.keysPressed.a) vx -= 1;
    if (this.keysPressed.d) vx += 1;
    if (this.keysPressed.w) vy -= 1;
    if (this.keysPressed.s) vy += 1;

    // Normalize diagonal movement to maintain consistent speed
    if (vx !== 0 && vy !== 0) {
      const magnitude = Math.sqrt(vx * vx + vy * vy);
      vx /= magnitude;
      vy /= magnitude;
    }

    // Apply movement speed
    vx *= MOVEMENT_SPEED;
    vy *= MOVEMENT_SPEED;

    // Update player velocity
    this.callbacks.onUpdateVelocity(vx, vy);
  }

  public isInFireMode(): boolean {
    return this.fireMode;
  }

  public cancelFireMode(): void {
    this.fireMode = false;
  }
}
