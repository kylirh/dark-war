import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TileType,
  TILE_DEFINITIONS,
  CELL_CONFIG,
  Entity,
} from "../types";

/**
 * Convert 2D coordinates to 1D map array index
 */
export function idx(x: number, y: number): number {
  return x + y * MAP_WIDTH;
}

/**
 * Convert 2D coordinates to a 1D map array index for a specific map width.
 */
export function idxFor(x: number, y: number, width: number): number {
  return x + y * width;
}

/**
 * Check if coordinates are within map bounds
 */
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

/**
 * Check if coordinates are within specific map dimensions.
 */
export function inBoundsFor(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * Get tile type at coordinates
 */
export function tileAt(map: TileType[], x: number, y: number): TileType {
  if (!inBounds(x, y)) return TileType.WALL;
  return map[idx(x, y)];
}

/**
 * Get tile type at coordinates for a specific map size.
 */
export function tileAtFor(
  map: TileType[],
  x: number,
  y: number,
  width: number,
  height: number,
): TileType {
  if (!inBoundsFor(x, y, width, height)) return TileType.WALL;
  return map[idxFor(x, y, width)];
}

/**
 * Set tile type at coordinates
 */
export function setTile(
  map: TileType[],
  x: number,
  y: number,
  tile: TileType,
): void {
  map[idx(x, y)] = tile;
}

/**
 * Set tile type for a specific map width.
 */
export function setTileFor(
  map: TileType[],
  x: number,
  y: number,
  width: number,
  tile: TileType,
): void {
  map[idxFor(x, y, width)] = tile;
}

/**
 * Check if tile is passable (not blocked)
 */
export function passable(map: TileType[], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = TILE_DEFINITIONS[tileAt(map, x, y)];
  return tile && !tile.block;
}

/**
 * Check if a tile is passable for a specific map size.
 */
export function passableFor(
  map: TileType[],
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!inBoundsFor(x, y, width, height)) return false;
  const tile = TILE_DEFINITIONS[tileAtFor(map, x, y, width, height)];
  return tile && !tile.block;
}

/**
 * Calculate Manhattan distance between two points
 */
export function dist(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/**
 * Teleport entity to center of a grid cell
 * Sets both worldX/worldY and prevWorldX/prevWorldY for immediate position change
 */
export function setPositionFromGrid(
  entity: Entity,
  gridX: number,
  gridY: number,
): void {
  entity.worldX = gridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
  entity.worldY = gridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
  entity.prevWorldX = entity.worldX;
  entity.prevWorldY = entity.worldY;
}
