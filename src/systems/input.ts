/**
 * Input handling and keyboard controls
 * Tracks key states for continuous remappable movement with normalized diagonals.
 */
import { KeyBindingAction, UserPreferences } from "./preferences";

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
  onToggleCTDM: () => void;
  onToggleGodMode: () => void;
  onResumePause: (reason: string) => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSelectWeapon: (slot: number) => void;
}

export class InputHandler {
  private callbacks: InputCallbacks;
  private getPreferences: () => UserPreferences;
  private fireMode = false;
  private lastInteractDirection: Direction = [0, 0];
  private readonly onKeyDown = (e: KeyboardEvent): void =>
    this.handleKeyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);

  private keysPressed = {
    moveUp: false,
    moveLeft: false,
    moveDown: false,
    moveRight: false,
  };

  constructor(callbacks: InputCallbacks, getPreferences: () => UserPreferences) {
    this.callbacks = callbacks;
    this.getPreferences = getPreferences;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (
      e.defaultPrevented ||
      document.body.classList.contains("imb-modal-open")
    ) {
      return;
    }

    const key = e.key.toLowerCase();
    const code = e.code;
    const preferences = this.getPreferences();

    if (this.isActionCode("weapon1", code, preferences)) {
      e.preventDefault();
      this.callbacks.onSelectWeapon(1);
      return;
    }
    if (this.isActionCode("weapon2", code, preferences)) {
      e.preventDefault();
      this.callbacks.onSelectWeapon(2);
      return;
    }
    if (this.isActionCode("weapon3", code, preferences)) {
      e.preventDefault();
      this.callbacks.onSelectWeapon(3);
      return;
    }
    if (this.isActionCode("weapon4", code, preferences)) {
      e.preventDefault();
      this.callbacks.onSelectWeapon(4);
      return;
    }

    if (this.isActionCode("moveUp", code, preferences)) {
      e.preventDefault();
      if (!this.keysPressed.moveUp) {
        this.keysPressed.moveUp = true;
        this.lastInteractDirection = [0, -1];
        this.updateVelocity();
      }
      return;
    }
    if (this.isActionCode("moveLeft", code, preferences)) {
      e.preventDefault();
      if (!this.keysPressed.moveLeft) {
        this.keysPressed.moveLeft = true;
        this.lastInteractDirection = [-1, 0];
        this.updateVelocity();
      }
      return;
    }
    if (this.isActionCode("moveDown", code, preferences)) {
      e.preventDefault();
      if (!this.keysPressed.moveDown) {
        this.keysPressed.moveDown = true;
        this.lastInteractDirection = [0, 1];
        this.updateVelocity();
      }
      return;
    }
    if (this.isActionCode("moveRight", code, preferences)) {
      e.preventDefault();
      if (!this.keysPressed.moveRight) {
        this.keysPressed.moveRight = true;
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
    if (this.isActionCode("interact", code, preferences)) {
      e.preventDefault();
      const [dx, dy] = this.getInteractDirection();
      this.callbacks.onInteract(dx, dy);
      return;
    }

    // Pick up items
    if (this.isActionCode("pickup", code, preferences)) {
      e.preventDefault();
      this.callbacks.onPickup();
      return;
    }

    if (
      preferences.devTools &&
      this.isActionCode("toggleGodMode", code, preferences)
    ) {
      e.preventDefault();
      this.callbacks.onToggleGodMode();
      return;
    }

    if (this.isActionCode("reload", code, preferences)) {
      e.preventDefault();
      this.callbacks.onReload();
      return;
    }

    if (
      preferences.devTools &&
      this.isActionCode("toggleFOV", code, preferences)
    ) {
      e.preventDefault();
      this.callbacks.onToggleFOV();
      return;
    }

    if (this.isActionCode("toggleCTDM", code, preferences)) {
      e.preventDefault();
      this.callbacks.onToggleCTDM();
      return;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (
      e.defaultPrevented ||
      document.body.classList.contains("imb-modal-open")
    ) {
      return;
    }

    const code = e.code;
    const preferences = this.getPreferences();

    if (this.isActionCode("moveUp", code, preferences)) {
      e.preventDefault();
      this.keysPressed.moveUp = false;
      this.updateVelocity();
      return;
    }
    if (this.isActionCode("moveLeft", code, preferences)) {
      e.preventDefault();
      this.keysPressed.moveLeft = false;
      this.updateVelocity();
      return;
    }
    if (this.isActionCode("moveDown", code, preferences)) {
      e.preventDefault();
      this.keysPressed.moveDown = false;
      this.updateVelocity();
      return;
    }
    if (this.isActionCode("moveRight", code, preferences)) {
      e.preventDefault();
      this.keysPressed.moveRight = false;
      this.updateVelocity();
      return;
    }
  }

  private isActionCode(
    action: KeyBindingAction,
    code: string,
    preferences: UserPreferences,
  ): boolean {
    return preferences.keyBindings[action] === code;
  }

  /**
   * Calculate and apply normalized velocity from movement key states.
   */
  private updateVelocity(): void {
    let vx = 0;
    let vy = 0;

    if (this.keysPressed.moveLeft) vx -= 1;
    if (this.keysPressed.moveRight) vx += 1;
    if (this.keysPressed.moveUp) vy -= 1;
    if (this.keysPressed.moveDown) vy += 1;

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
    if (this.keysPressed.moveLeft) dx -= 1;
    if (this.keysPressed.moveRight) dx += 1;
    if (this.keysPressed.moveUp) dy -= 1;
    if (this.keysPressed.moveDown) dy += 1;

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
    this.keysPressed.moveUp = false;
    this.keysPressed.moveLeft = false;
    this.keysPressed.moveDown = false;
    this.keysPressed.moveRight = false;
    this.updateVelocity();
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
