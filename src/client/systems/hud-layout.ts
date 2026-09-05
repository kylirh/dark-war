/**
 * Keeps the floating gameplay HUD from obscuring the local player.
 *
 * The renderer supplies the player's screen-space rectangle. This module only
 * owns DOM layout decisions, which keeps the placement rules independent from
 * world coordinates and makes the collision checks easy to test.
 */

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const TOP_HUD_CLEARANCE = 12;
const HUD_LOG_GAP = 8;
const MAP_HUD_GAP = 12;
const GAME_AREA_INSET = 12;

/** Return true when two screen-space rectangles overlap. */
export function screenRectsOverlap(
  first: ScreenRect,
  second: ScreenRect,
  padding: number = 0,
): boolean {
  return (
    first.left - padding < second.right &&
    first.right + padding > second.left &&
    first.top - padding < second.bottom &&
    first.bottom + padding > second.top
  );
}

/** Floating HUD placement controller for the gameplay canvas. */
export class HudLayout {
  private readonly gameArea: HTMLElement;
  private readonly health: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly map: HTMLElement;
  private readonly story: HTMLElement;

  public constructor() {
    this.gameArea = this.getElement(".game-area");
    this.health = this.getElement("hp-overlay");
    this.inventory = this.getElement("inventory-bar");
    this.map = this.getElement("world-map");
    this.story = this.getElement("story-overlay");
  }

  /** Recalculate all collision-aware HUD placements for the current frame. */
  public update(playerRect: ScreenRect | null): void {
    if (!playerRect) return;

    this.resetTransientLayout();

    const topHudRects = [
      this.health.getBoundingClientRect(),
      this.inventory.getBoundingClientRect(),
    ];
    if (
      topHudRects.some((rect) =>
        screenRectsOverlap(playerRect, rect, TOP_HUD_CLEARANCE),
      )
    ) {
      this.moveTopHudAboveStoryLog();
    }

    const mapRect = this.map.getBoundingClientRect();
    if (
      this.isVisible(this.map) &&
      screenRectsOverlap(playerRect, mapRect, 4)
    ) {
      this.map.classList.add("world-map-top");
      this.placeMapBesideInventory();
    }

    const storyRect = this.story.getBoundingClientRect();
    if (
      this.isVisible(this.story) &&
      screenRectsOverlap(playerRect, storyRect)
    ) {
      this.story.classList.add("player-obscured");
    }
  }

  private resetTransientLayout(): void {
    this.health.classList.remove("hud-bottom");
    this.inventory.classList.remove("hud-bottom");
    this.map.classList.remove("world-map-top");
    this.story.classList.remove("player-obscured");

    this.health.style.removeProperty("--hud-bottom-offset");
    this.inventory.style.removeProperty("--hud-bottom-offset");
    this.map.style.removeProperty("left");
    this.map.style.removeProperty("right");
  }

  private moveTopHudAboveStoryLog(): void {
    const gameAreaRect = this.gameArea.getBoundingClientRect();
    const storyRect = this.story.getBoundingClientRect();
    const bottomOffset = Math.max(
      HUD_LOG_GAP,
      gameAreaRect.bottom - storyRect.top + HUD_LOG_GAP,
    );
    const offset = `${Math.round(bottomOffset)}px`;

    this.health.classList.add("hud-bottom");
    this.inventory.classList.add("hud-bottom");
    this.health.style.setProperty("--hud-bottom-offset", offset);
    this.inventory.style.setProperty("--hud-bottom-offset", offset);
  }

  private placeMapBesideInventory(): void {
    const mapRect = this.map.getBoundingClientRect();
    const gameAreaRect = this.gameArea.getBoundingClientRect();
    const inventoryRect = this.inventory.getBoundingClientRect();
    if (mapRect.width <= 0 || gameAreaRect.width <= 0) return;

    const inventoryRight =
      inventoryRect.width > 0
        ? inventoryRect.right
        : gameAreaRect.right - mapRect.width - GAME_AREA_INSET;
    const minimumLeft = gameAreaRect.left + GAME_AREA_INSET;
    const maximumLeft = Math.max(
      minimumLeft,
      gameAreaRect.right - mapRect.width - GAME_AREA_INSET,
    );
    const desiredLeft = inventoryRight + MAP_HUD_GAP;
    const left = Math.min(Math.max(desiredLeft, minimumLeft), maximumLeft);

    this.map.style.left = `${Math.round(left - gameAreaRect.left)}px`;
    this.map.style.right = "auto";
  }

  private isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  private getElement(selectorOrId: string): HTMLElement {
    const element = selectorOrId.startsWith(".")
      ? document.querySelector<HTMLElement>(selectorOrId)
      : document.getElementById(selectorOrId);
    if (!element) {
      throw new Error(`HUD element "${selectorOrId}" not found`);
    }
    return element;
  }
}
