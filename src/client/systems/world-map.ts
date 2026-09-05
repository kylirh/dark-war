/**
 * Discovered-world map presentation and map-to-camera interaction.
 *
 * This is intentionally a small 2D canvas renderer rather than a second copy
 * of the Pixi world renderer. It reads the active GameState, draws only cells
 * in the player's explored set, and exposes pure geometry helpers so the
 * wrap-around and large-world rules stay testable without a DOM.
 */

import {
  CELL_CONFIG,
  EntityKind,
  GameState,
  TileType,
} from "../../engine/types";
import type { Entity } from "../../engine/types";
import { wrapValue } from "../../engine/utils/wrap";

const MAP_CANVAS_WIDTH = 240;
const MAP_CANVAS_HEIGHT = 180;
const MAP_MAX_WINDOW_WIDTH = 160;
const MAP_MAX_WINDOW_HEIGHT = 120;

/** Semantic colors used by the overview map. Kept separate from atlas art. */
export const WORLD_MAP_TILE_COLORS: Partial<Record<TileType, string>> = {
  [TileType.WALL]: "#566b7b",
  [TileType.FLOOR]: "#a98663",
  [TileType.DOOR_CLOSED]: "#d3a34d",
  [TileType.DOOR_OPEN]: "#d3a34d",
  [TileType.DOOR_LOCKED]: "#e1b85c",
  [TileType.STAIRS_DOWN]: "#66d8cf",
  [TileType.STAIRS_UP]: "#66d8cf",
  [TileType.HOLE]: "#1b2638",
  [TileType.ASPHALT]: "#465765",
  [TileType.SIDEWALK]: "#9b9b82",
  [TileType.GRASS]: "#438b62",
  [TileType.WEEDS]: "#5b9d5d",
  [TileType.PARK_PATH]: "#bf9a65",
  [TileType.TREE]: "#286b56",
  [TileType.BUILDING]: "#b46f61",
  [TileType.FENCE]: "#b98855",
  [TileType.RUBBLE]: "#7e7372",
  [TileType.HOLOWALL]: "#6c83a4",
  [TileType.LIGHT]: "#d4bf65",
  [TileType.WATER_SHALLOW]: "#3faaa7",
  [TileType.WATER_DEEP]: "#2c718d",
  [TileType.WATER_RIVER]: "#4dc3c6",
};

/** Future-proof, data-driven marker vocabulary for map landmarks. */
export type WorldMapLandmarkKind =
  | "player"
  | "other-player"
  | "portal"
  | "npc"
  | "enemy"
  | "tombstone"
  | "sign";

export interface WorldMapLandmarkStyle {
  color: string;
  shape: "circle" | "diamond" | "square" | "triangle";
}

export const WORLD_MAP_LANDMARK_STYLES: Record<
  WorldMapLandmarkKind,
  WorldMapLandmarkStyle
> = {
  player: { color: "#ffdf76", shape: "triangle" },
  "other-player": { color: "#a9f2e0", shape: "circle" },
  portal: { color: "#f3c969", shape: "diamond" },
  npc: { color: "#f3a071", shape: "circle" },
  enemy: { color: "#ed7373", shape: "triangle" },
  tombstone: { color: "#c6b8d8", shape: "square" },
  sign: { color: "#f4dd8b", shape: "square" },
};

export interface WorldMapWindow {
  /** Unwrapped world tile coordinate of the displayed window's top-left. */
  left: number;
  top: number;
  width: number;
  height: number;
  wraps: boolean;
}

export interface WorldMapCanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface WorldMapTileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Choose a full-world overview when it is reasonable, otherwise a bounded
 * chunk centered on the active camera. Outside chunks may cross the toroidal
 * seam because their coordinates intentionally remain unwrapped.
 */
export function computeWorldMapWindow(
  mapWidth: number,
  mapHeight: number,
  wraps: boolean,
  focusTileX: number,
  focusTileY: number,
): WorldMapWindow {
  const width = Math.min(mapWidth, MAP_MAX_WINDOW_WIDTH);
  const height = Math.min(mapHeight, MAP_MAX_WINDOW_HEIGHT);
  const isFullWorld = width === mapWidth && height === mapHeight;

  if (isFullWorld) {
    return { left: 0, top: 0, width, height, wraps };
  }

  const centeredLeft = Math.floor(focusTileX - width / 2);
  const centeredTop = Math.floor(focusTileY - height / 2);
  return {
    left: wraps
      ? centeredLeft
      : Math.max(0, Math.min(centeredLeft, mapWidth - width)),
    top: wraps
      ? centeredTop
      : Math.max(0, Math.min(centeredTop, mapHeight - height)),
    width,
    height,
    wraps,
  };
}

/** Fit a map window into the fixed overview canvas without distorting it. */
export function fitWorldMapCanvas(
  canvasWidth: number,
  canvasHeight: number,
  mapWidth: number,
  mapHeight: number,
): WorldMapCanvasRect {
  const scale = Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight);
  const width = mapWidth * scale;
  const height = mapHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
    scale,
  };
}

/** Return one or two intervals when an interval crosses a wrapped edge. */
export function wrappedIntervals(
  start: number,
  length: number,
  span: number,
): Array<{ start: number; length: number }> {
  if (span <= 0 || length <= 0) return [];
  if (length >= span) return [{ start: 0, length: span }];

  const normalizedStart = wrapValue(start, span);
  const firstLength = Math.min(length, span - normalizedStart);
  const intervals = [{ start: normalizedStart, length: firstLength }];
  if (firstLength < length) {
    intervals.push({ start: 0, length: length - firstLength });
  }
  return intervals;
}

/**
 * Convert the renderer's world-pixel viewport into map-window tile rectangles.
 * Multiple rectangles are returned when a full toroidal overview crosses a
 * seam, so the outline remains one continuous viewport instead of a false
 * diagonal across the map.
 */
export function worldMapViewportRects(
  mapWindow: WorldMapWindow,
  cameraTopLeft: { x: number; y: number },
  viewWorldSize: { viewW: number; viewH: number },
  mapWidth: number,
  mapHeight: number,
): WorldMapTileRect[] {
  const cameraLeft = cameraTopLeft.x / CELL_CONFIG.w;
  const cameraTop = cameraTopLeft.y / CELL_CONFIG.h;
  const viewWidth = viewWorldSize.viewW / CELL_CONFIG.w;
  const viewHeight = viewWorldSize.viewH / CELL_CONFIG.h;
  const isFullWorld =
    mapWindow.left === 0 &&
    mapWindow.top === 0 &&
    mapWindow.width === mapWidth &&
    mapWindow.height === mapHeight;

  const xIntervals =
    isFullWorld && mapWindow.wraps
      ? wrappedIntervals(cameraLeft, viewWidth, mapWidth)
      : clippedInterval(
          cameraLeft - mapWindow.left,
          viewWidth,
          mapWindow.width,
        );
  const yIntervals =
    isFullWorld && mapWindow.wraps
      ? wrappedIntervals(cameraTop, viewHeight, mapHeight)
      : clippedInterval(
          cameraTop - mapWindow.top,
          viewHeight,
          mapWindow.height,
        );

  return xIntervals.flatMap((x) =>
    yIntervals.map((y) => ({
      x: x.start,
      y: y.start,
      width: x.length,
      height: y.length,
    })),
  );
}

function clippedInterval(
  start: number,
  length: number,
  span: number,
): Array<{ start: number; length: number }> {
  const clippedStart = Math.max(0, start);
  const clippedEnd = Math.min(span, start + length);
  return clippedEnd > clippedStart
    ? [{ start: clippedStart, length: clippedEnd - clippedStart }]
    : [];
}

/** Convert a canvas point to the world tile under the pointer. */
export function worldMapTileAtCanvasPoint(
  pointX: number,
  pointY: number,
  canvasWidth: number,
  canvasHeight: number,
  mapWindow: WorldMapWindow,
): { x: number; y: number } | null {
  const mapRect = fitWorldMapCanvas(
    canvasWidth,
    canvasHeight,
    mapWindow.width,
    mapWindow.height,
  );
  if (
    pointX < mapRect.x ||
    pointY < mapRect.y ||
    pointX > mapRect.x + mapRect.width ||
    pointY > mapRect.y + mapRect.height
  ) {
    return null;
  }

  const rawX = Math.floor(
    mapWindow.left + (pointX - mapRect.x) / mapRect.scale,
  );
  const rawY = Math.floor(mapWindow.top + (pointY - mapRect.y) / mapRect.scale);
  return { x: rawX, y: rawY };
}

/** Keep a world tile near the displayed chunk's unwrapped coordinates. */
function nearestDisplayedTile(
  tile: number,
  windowStart: number,
  mapSpan: number,
  windowSpan: number,
  wraps: boolean,
): number {
  if (!wraps) return tile;
  if (windowSpan === mapSpan) return wrapValue(tile, mapSpan);
  const delta =
    wrapValue(tile - windowStart + mapSpan / 2, mapSpan) - mapSpan / 2;
  return windowStart + delta;
}

function isEntityAtKnownTile(state: GameState, entity: Entity): boolean {
  const x = wrapValue(entity.gridX, state.mapWidth);
  const y = wrapValue(entity.gridY, state.mapHeight);
  return !state.options.fov || state.explored.has(x + y * state.mapWidth);
}

function entityLandmarkKind(
  entity: Entity,
  state: GameState,
): WorldMapLandmarkKind | null {
  if (entity.kind === EntityKind.PLAYER) {
    return entity.id === state.player.id ? "player" : "other-player";
  }
  if (entity.kind === EntityKind.ITEM && entity.deathDrop) {
    return "tombstone";
  }
  if (entity.kind === EntityKind.MONSTER) {
    if (entity.peaceful || entity.social || entity.interactable) return "npc";
    const index =
      wrapValue(entity.gridX, state.mapWidth) +
      wrapValue(entity.gridY, state.mapHeight) * state.mapWidth;
    return state.visible.has(index) ? "enemy" : null;
  }
  return null;
}

function mapTileColor(tile: TileType): string {
  return WORLD_MAP_TILE_COLORS[tile] ?? "#354756";
}

function drawLandmark(
  context: CanvasRenderingContext2D,
  style: WorldMapLandmarkStyle,
  x: number,
  y: number,
  size: number,
): void {
  const radius = Math.max(2, Math.min(4, size * 0.42));
  context.fillStyle = style.color;
  context.beginPath();
  if (style.shape === "diamond") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
  } else if (style.shape === "triangle") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y + radius);
    context.lineTo(x - radius, y + radius);
  } else if (style.shape === "square") {
    context.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
  context.closePath();
  context.fill();
}

export interface WorldMapOptions {
  onPanToWorld: (worldX: number, worldY: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

/** Fixed lower-right discovered-world map and its pointer interactions. */
export class WorldMap {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly options: WorldMapOptions;
  private readonly usesPointerEvents: boolean;
  private pointerActive = false;
  private activePointerId: number | undefined;
  private currentWindow: WorldMapWindow | null = null;
  private currentMapWidth = 0;
  private currentMapHeight = 0;

  public constructor(options: WorldMapOptions) {
    this.options = options;
    this.root = this.getElement("world-map");
    this.canvas = this.getElement("world-map-canvas");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Cannot create discovered-world map context");
    this.context = context;
    this.usesPointerEvents = "PointerEvent" in window;
    this.canvas.width = MAP_CANVAS_WIDTH;
    this.canvas.height = MAP_CANVAS_HEIGHT;
    if (this.usesPointerEvents) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      window.addEventListener("pointermove", this.onWindowPointerMove);
      window.addEventListener("pointerup", this.onWindowPointerUp);
      window.addEventListener("pointercancel", this.onWindowPointerUp);
    } else {
      this.canvas.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("mousemove", this.onWindowMouseMove);
      window.addEventListener("mouseup", this.onWindowMouseUp);
    }
  }

  public render(
    state: GameState,
    cameraTopLeft: { x: number; y: number },
    viewWorldSize: { viewW: number; viewH: number },
  ): void {
    const focusTileX = Math.floor(
      (cameraTopLeft.x + viewWorldSize.viewW / 2) / CELL_CONFIG.w,
    );
    const focusTileY = Math.floor(
      (cameraTopLeft.y + viewWorldSize.viewH / 2) / CELL_CONFIG.h,
    );
    const mapWindow = computeWorldMapWindow(
      state.mapWidth,
      state.mapHeight,
      state.levelKind === "outside",
      focusTileX,
      focusTileY,
    );
    this.currentWindow = mapWindow;
    this.currentMapWidth = state.mapWidth;
    this.currentMapHeight = state.mapHeight;

    // Match the drawing buffer to the displayed window's aspect ratio. Outside
    // worlds are 16:9 while dungeons are 4:3; keeping one fixed canvas size
    // would add letterboxing above and below the outside-world map.
    const canvasHeight = Math.max(
      1,
      Math.round((MAP_CANVAS_WIDTH * mapWindow.height) / mapWindow.width),
    );
    if (this.canvas.height !== canvasHeight) {
      this.canvas.height = canvasHeight;
    }

    const context = this.context;
    const mapRect = fitWorldMapCanvas(
      this.canvas.width,
      this.canvas.height,
      mapWindow.width,
      mapWindow.height,
    );
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = "#08151c";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const wraps = mapWindow.wraps;
    const known = (index: number): boolean =>
      !state.options.fov || state.explored.has(index);

    for (let row = 0; row < mapWindow.height; row++) {
      for (let column = 0; column < mapWindow.width; column++) {
        const rawX = Math.floor(mapWindow.left + column);
        const rawY = Math.floor(mapWindow.top + row);
        const mapX = wraps ? wrapValue(rawX, state.mapWidth) : rawX;
        const mapY = wraps ? wrapValue(rawY, state.mapHeight) : rawY;
        if (
          mapX < 0 ||
          mapY < 0 ||
          mapX >= state.mapWidth ||
          mapY >= state.mapHeight
        ) {
          continue;
        }
        const index = mapX + mapY * state.mapWidth;
        if (!known(index)) continue;
        context.globalAlpha =
          state.options.fov && !state.visible.has(index) ? 0.62 : 1;
        context.fillStyle = mapTileColor(state.tiles.getTile(mapX, mapY));
        context.fillRect(
          mapRect.x + column * mapRect.scale,
          mapRect.y + row * mapRect.scale,
          Math.ceil(mapRect.scale),
          Math.ceil(mapRect.scale),
        );
      }
    }
    context.globalAlpha = 1;

    // Portals and signs are stable landmarks. Their symbols are shown only
    // after the cell itself has entered this player's explored set.
    for (const portal of state.portals) {
      if (
        portal.source.spaceId !== state.worldSpaceId ||
        portal.source.planeId !== state.worldPlaneId
      ) {
        continue;
      }
      this.drawWorldMarker(
        state,
        mapWindow,
        mapRect,
        portal.source.x,
        portal.source.y,
        "portal",
      );
    }
    for (const sign of state.signs) {
      this.drawWorldMarker(state, mapWindow, mapRect, sign.x, sign.y, "sign");
    }

    for (const entity of state.entities) {
      if (entity.kind === EntityKind.PLAYER) continue;
      const kind = entityLandmarkKind(entity, state);
      if (!kind || !isEntityAtKnownTile(state, entity)) continue;
      this.drawWorldMarker(
        state,
        mapWindow,
        mapRect,
        entity.gridX,
        entity.gridY,
        kind,
      );
    }

    const viewportRects = worldMapViewportRects(
      mapWindow,
      cameraTopLeft,
      viewWorldSize,
      state.mapWidth,
      state.mapHeight,
    );
    context.fillStyle = "rgba(93, 226, 209, 0.12)";
    context.strokeStyle = "#39ff6a";
    context.lineWidth = 1.5;
    for (const viewport of viewportRects) {
      const x = mapRect.x + viewport.x * mapRect.scale;
      const y = mapRect.y + viewport.y * mapRect.scale;
      const width = viewport.width * mapRect.scale;
      const height = viewport.height * mapRect.scale;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
    }

    this.drawPlayerMarker(
      state,
      mapWindow,
      mapRect,
      state.player.gridX,
      state.player.gridY,
    );
    this.root.classList.toggle(
      "world-map-chunked",
      !this.isFullWorld(state, mapWindow),
    );
    this.root.setAttribute(
      "aria-label",
      this.isFullWorld(state, mapWindow)
        ? "Discovered world map. Drag to move the game view."
        : "Discovered world map showing the current world chunk. Drag to move the game view.",
    );
  }

  public dispose(): void {
    if (this.usesPointerEvents) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      window.removeEventListener("pointermove", this.onWindowPointerMove);
      window.removeEventListener("pointerup", this.onWindowPointerUp);
      window.removeEventListener("pointercancel", this.onWindowPointerUp);
    } else {
      this.canvas.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("mousemove", this.onWindowMouseMove);
      window.removeEventListener("mouseup", this.onWindowMouseUp);
    }
  }

  private drawWorldMarker(
    state: GameState,
    mapWindow: WorldMapWindow,
    mapRect: WorldMapCanvasRect,
    tileX: number,
    tileY: number,
    kind: WorldMapLandmarkKind,
  ): void {
    const mapX = nearestDisplayedTile(
      tileX,
      mapWindow.left,
      state.mapWidth,
      mapWindow.width,
      mapWindow.wraps,
    );
    const mapY = nearestDisplayedTile(
      tileY,
      mapWindow.top,
      state.mapHeight,
      mapWindow.height,
      mapWindow.wraps,
    );
    const relativeX = mapX - mapWindow.left;
    const relativeY = mapY - mapWindow.top;
    if (
      relativeX < 0 ||
      relativeY < 0 ||
      relativeX >= mapWindow.width ||
      relativeY >= mapWindow.height
    ) {
      return;
    }
    const mapIndex =
      wrapValue(tileX, state.mapWidth) +
      wrapValue(tileY, state.mapHeight) * state.mapWidth;
    if (
      state.options.fov &&
      !state.explored.has(mapIndex) &&
      kind !== "player"
    ) {
      return;
    }
    drawLandmark(
      this.context,
      WORLD_MAP_LANDMARK_STYLES[kind],
      mapRect.x + (relativeX + 0.5) * mapRect.scale,
      mapRect.y + (relativeY + 0.5) * mapRect.scale,
      mapRect.scale,
    );
  }

  private drawPlayerMarker(
    state: GameState,
    mapWindow: WorldMapWindow,
    mapRect: WorldMapCanvasRect,
    tileX: number,
    tileY: number,
  ): void {
    const mapX = nearestDisplayedTile(
      tileX,
      mapWindow.left,
      state.mapWidth,
      mapWindow.width,
      mapWindow.wraps,
    );
    const mapY = nearestDisplayedTile(
      tileY,
      mapWindow.top,
      state.mapHeight,
      mapWindow.height,
      mapWindow.wraps,
    );
    const relativeX = mapX - mapWindow.left;
    const relativeY = mapY - mapWindow.top;
    if (
      relativeX >= 0 &&
      relativeY >= 0 &&
      relativeX < mapWindow.width &&
      relativeY < mapWindow.height
    ) {
      this.drawWorldMarker(state, mapWindow, mapRect, tileX, tileY, "player");
      return;
    }

    // A chunk can be panned away from the player on a very large world. Keep
    // the position discoverable with an edge marker rather than losing it.
    const edgeX = Math.max(0.75, Math.min(mapWindow.width - 0.75, relativeX));
    const edgeY = Math.max(0.75, Math.min(mapWindow.height - 0.75, relativeY));
    drawLandmark(
      this.context,
      WORLD_MAP_LANDMARK_STYLES.player,
      mapRect.x + edgeX * mapRect.scale,
      mapRect.y + edgeY * mapRect.scale,
      mapRect.scale,
    );
  }

  private isFullWorld(state: GameState, mapWindow: WorldMapWindow): boolean {
    return (
      mapWindow.width === state.mapWidth && mapWindow.height === state.mapHeight
    );
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Element with id "${id}" not found`);
    return element as T;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.currentWindow) return;

    event.preventDefault();
    event.stopPropagation();
    this.pointerActive = true;
    this.activePointerId = event.pointerId;
    this.options.onInteractionStart();
    if (typeof this.canvas.setPointerCapture === "function") {
      this.canvas.setPointerCapture(event.pointerId);
    }
    this.panFromPointer(event);
  };

  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    if (!this.pointerActive || event.pointerId !== this.activePointerId) return;

    event.preventDefault();
    this.panFromPointer(event);
  };

  private readonly onWindowPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;

    event.preventDefault();
    this.pointerActive = false;
    this.activePointerId = undefined;
    this.options.onInteractionEnd();
    if (
      typeof this.canvas.hasPointerCapture === "function" &&
      this.canvas.hasPointerCapture(event.pointerId)
    ) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.currentWindow) return;

    event.preventDefault();
    event.stopPropagation();
    this.pointerActive = true;
    this.options.onInteractionStart();
    this.panFromPointer(event);
  };

  private readonly onWindowMouseMove = (event: MouseEvent): void => {
    if (!this.pointerActive) return;

    event.preventDefault();
    this.panFromPointer(event);
  };

  private readonly onWindowMouseUp = (event: MouseEvent): void => {
    if (!this.pointerActive) return;

    event.preventDefault();
    this.pointerActive = false;
    this.options.onInteractionEnd();
  };

  private panFromPointer(event: { clientX: number; clientY: number }): void {
    const mapWindow = this.currentWindow;
    if (!mapWindow) return;
    const bounds = this.canvas.getBoundingClientRect();
    const point = worldMapTileAtCanvasPoint(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) *
        this.canvas.width,
      ((event.clientY - bounds.top) / Math.max(1, bounds.height)) *
        this.canvas.height,
      this.canvas.width,
      this.canvas.height,
      mapWindow,
    );
    if (!point) return;
    const x = mapWindow.wraps
      ? wrapValue(point.x, this.currentMapWidth)
      : Math.max(0, Math.min(point.x, this.currentMapWidth - 1));
    const y = mapWindow.wraps
      ? wrapValue(point.y, this.currentMapHeight)
      : Math.max(0, Math.min(point.y, this.currentMapHeight - 1));
    this.options.onPanToWorld(
      x * CELL_CONFIG.w + CELL_CONFIG.w / 2,
      y * CELL_CONFIG.h + CELL_CONFIG.h / 2,
    );
  }
}
