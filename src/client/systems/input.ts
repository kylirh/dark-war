/**
 * Input handling and keyboard controls
 * Tracks key states for continuous remappable movement with normalized diagonals.
 */
import {
  KeyBindingAction,
  UserPreferences,
  matchesBinding,
  KEY_BINDING_DEFINITIONS,
} from "./preferences";

export type Direction = [number, number];

// Movement speed constant
export const MOVEMENT_SPEED = 225; // pixels per second

export interface InputCallbacks {
  onUpdateVelocity: (vx: number, vy: number) => void; // Continuous velocity update
  onFire: (dx: number, dy: number) => void;
  onInteract: (dx: number, dy: number) => void;
  onOpenCalloutComposer: (kind: "speech" | "thought") => void;
  onPickup: () => void;
  onWait: () => void;
  onReload: () => void;
  onToggleCTDM: () => void;
  onToggleMatterManipulator: () => void;
  onPrototypeLower: () => boolean;
  onPrototypeRaise: () => boolean;
  onOpenCommandPrompt: () => void;
  onResumePause: (reason: string) => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSelectWeapon: (slot: number) => void;
  onSelectInventorySlot: (slotIndex: number) => void;
  onOpenInventory: (tab: "inventory" | "game") => void;
  onCycleSlot: (direction: number) => void;
}

export class InputHandler {
  private callbacks: InputCallbacks;
  private getPreferences: () => UserPreferences;
  private isWorldInputBlocked: () => boolean;
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

  constructor(
    callbacks: InputCallbacks,
    getPreferences: () => UserPreferences,
    isWorldInputBlocked: () => boolean = () => false,
  ) {
    this.callbacks = callbacks;
    this.getPreferences = getPreferences;
    this.isWorldInputBlocked = isWorldInputBlocked;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (this.isWorldInputBlocked()) return;

    const preferences = this.getPreferences();
    const action = KEY_BINDING_DEFINITIONS.find((definition) =>
      matchesBinding(e, definition.action, preferences),
    )?.action;
    if (!action) return;
    const modal = document.body.classList.contains("imb-modal-open");
    if (
      e.target instanceof HTMLElement &&
      (e.target.matches("input, textarea, select") ||
        e.target.isContentEditable)
    )
      return;
    if (action === "gameMenu" || action === "inventory") {
      e.preventDefault();
      this.resetKeys();
      this.callbacks.onOpenInventory(
        action === "inventory" ? "inventory" : "game",
      );
      return;
    }
    if (modal) return;
    e.preventDefault();
    if (action in this.keysPressed) {
      this.keysPressed[action as keyof typeof this.keysPressed] = true;
      this.movementCodes.set(e.code, action as keyof typeof this.keysPressed);
      const directions: Record<string, Direction> = {
        moveUp: [0, -1],
        moveDown: [0, 1],
        moveLeft: [-1, 0],
        moveRight: [1, 0],
      };
      this.lastInteractDirection = directions[action];
      this.updateVelocity();
      return;
    }
    if (e.repeat) return;
    if (action.startsWith("slot")) {
      this.callbacks.onSelectInventorySlot(Number(action.slice(4)) - 1);
      return;
    }
    switch (action) {
      case "interact":
        this.callbacks.onInteract(...this.getInteractDirection());
        break;
      case "speak":
        this.callbacks.onOpenCalloutComposer("speech");
        break;
      case "think":
        this.callbacks.onOpenCalloutComposer("thought");
        break;
      case "pickup":
        this.callbacks.onPickup();
        break;
      case "reload":
        this.callbacks.onReload();
        break;
      case "rest":
        this.callbacks.onWait();
        break;
      case "toggleCTDM":
        this.callbacks.onToggleCTDM();
        break;
      case "toggleMatterManipulator":
        this.callbacks.onToggleMatterManipulator();
        break;
      case "lowerTerrain":
        this.callbacks.onPrototypeLower();
        break;
      case "raiseTerrain":
        this.callbacks.onPrototypeRaise();
        break;
      case "commandPrompt":
        this.resetKeys();
        this.callbacks.onOpenCommandPrompt();
        break;
      case "save":
        this.callbacks.onSave();
        break;
      case "load":
        this.callbacks.onLoad();
        break;
      case "newGame":
        this.callbacks.onNewGame();
        break;
    }
  }

  private readonly movementCodes = new Map<
    string,
    keyof typeof this.keysPressed
  >();
  private readonly onBlur = (): void => this.resetKeys();

  private handleKeyUp(e: KeyboardEvent): void {
    const action = this.movementCodes.get(e.code);
    if (!action) return;
    this.movementCodes.delete(e.code);
    this.keysPressed[action] = false;
    this.updateVelocity();
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
    this.movementCodes.clear();
    this.keysPressed.moveUp = false;
    this.keysPressed.moveLeft = false;
    this.keysPressed.moveDown = false;
    this.keysPressed.moveRight = false;
    this.updateVelocity();
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
}
