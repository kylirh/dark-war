/**
 * Input handling and keyboard controls
 * Tracks key states for continuous WASD movement with normalized diagonals
 */

export type Direction = [number, number];

// Movement speed constant
export const MOVEMENT_SPEED = 225; // pixels per second

export interface InputCallbacks {
  onUpdateVelocity: (vx: number, vy: number) => void; // Continuous velocity update
  onFire: (dx: number, dy: number) => void;
  onInteract: (dx: number, dy: number) => void;
  onPickup: () => void;
  onWait: () => void;
  onReload: () => void;
  onToggleFOV: () => void;
  onToggleRealTime: () => void;
  onResumePause: (reason: string) => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSelectWeapon: (slot: number) => void;
}

export class InputHandler {
  private callbacks: InputCallbacks;
  private fireMode = false;
  private lastInteractDirection: Direction = [0, 0];

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

    if (code === "Digit1") {
      e.preventDefault();
      this.callbacks.onSelectWeapon(1);
      return;
    }
    if (code === "Digit2") {
      e.preventDefault();
      this.callbacks.onSelectWeapon(2);
      return;
    }
    if (code === "Digit3") {
      e.preventDefault();
      this.callbacks.onSelectWeapon(3);
      return;
    }
    if (code === "Digit4") {
      e.preventDefault();
      this.callbacks.onSelectWeapon(4);
      return;
    }

    // Track WASD key states
    if (code === "KeyW") {
      e.preventDefault();
      if (!this.keysPressed.w) {
        this.keysPressed.w = true;
        this.lastInteractDirection = [0, -1];
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyA") {
      e.preventDefault();
      if (!this.keysPressed.a) {
        this.keysPressed.a = true;
        this.lastInteractDirection = [-1, 0];
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyS") {
      e.preventDefault();
      if (!this.keysPressed.s) {
        this.keysPressed.s = true;
        this.lastInteractDirection = [0, 1];
        this.updateVelocity();
      }
      return;
    }
    if (code === "KeyD") {
      e.preventDefault();
      if (!this.keysPressed.d) {
        this.keysPressed.d = true;
        this.lastInteractDirection = [1, 0];
        this.updateVelocity();
      }
      return;
    }

    // Escape key - cancel any active input mode
    if (key === "escape") {
      e.preventDefault();
      if (this.fireMode) {
        this.fireMode = false;
      }
      return;
    }

    // Interact with doors
    if (key === "o") {
      e.preventDefault();
      const [dx, dy] = this.getInteractDirection();
      this.callbacks.onInteract(dx, dy);
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

    // Toggle real-time mode (Enter)
    if (key === "enter") {
      e.preventDefault();
      this.callbacks.onToggleRealTime();
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

  private getInteractDirection(): Direction {
    let dx = 0;
    let dy = 0;
    if (this.keysPressed.a) dx -= 1;
    if (this.keysPressed.d) dx += 1;
    if (this.keysPressed.w) dy -= 1;
    if (this.keysPressed.s) dy += 1;

    if (Math.abs(dx) + Math.abs(dy) === 1) {
      this.lastInteractDirection = [dx, dy];
      return this.lastInteractDirection;
    }

    return this.lastInteractDirection;
  }

  public isInFireMode(): boolean {
    return this.fireMode;
  }

  public cancelFireMode(): void {
    this.fireMode = false;
  }

  /**
   * Reset all key states (useful when starting a new game)
   */
  public resetKeys(): void {
    this.keysPressed.w = false;
    this.keysPressed.a = false;
    this.keysPressed.s = false;
    this.keysPressed.d = false;
    this.updateVelocity();
  }
}
