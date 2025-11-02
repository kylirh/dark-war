import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TileType,
  TILE_DEFINITIONS,
  Entity,
} from "../types";

/**
 * Convert 2D coordinates to 1D map array index
 */
export function idx(x: number, y: number): number {
  return x + y * MAP_WIDTH;
}

/**
 * Check if coordinates are within map bounds
 */
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

/**
 * Get tile type at coordinates
 */
export function tileAt(map: TileType[], x: number, y: number): TileType {
  return map[idx(x, y)];
}

/**
 * Set tile type at coordinates
 */
export function setTile(
  map: TileType[],
  x: number,
  y: number,
  tile: TileType
): void {
  map[idx(x, y)] = tile;
}

/**
 * Check if tile is passable (not blocked)
 */
export function passable(map: TileType[], x: number, y: number): boolean {
  const tile = TILE_DEFINITIONS[tileAt(map, x, y)];
  return tile && !tile.block;
}

/**
 * Check if position is walkable (in bounds, passable, no entity)
 */
export function isWalkable(
  map: TileType[],
  entities: Entity[],
  x: number,
  y: number
): boolean {
  if (!inBounds(x, y)) return false;
  if (!passable(map, x, y)) return false;
  if (entityAt(entities, x, y)) return false;
  return true;
}

/**
 * Find first entity at coordinates, optionally filtered
 */
export function entityAt(
  entities: Entity[],
  x: number,
  y: number,
  filter?: (e: Entity) => boolean
): Entity | undefined {
  return entities.find((e) => e.x === x && e.y === y && (!filter || filter(e)));
}

/**
 * Find all entities at coordinates
 */
export function entitiesAt(entities: Entity[], x: number, y: number): Entity[] {
  return entities.filter((e) => e.x === x && e.y === y);
}

/**
 * Calculate Manhattan distance between two points
 */
export function dist(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/**
 * Bresenham line algorithm - returns all points on line from (x0,y0) to (x1,y1)
 */
export function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): [number, number][] {
  const points: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let e2: number;

  while (true) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

/**
 * Remove entity from entity array
 */
export function removeEntity(entities: Entity[], entity: Entity): void {
  const index = entities.indexOf(entity);
  if (index >= 0) {
    entities.splice(index, 1);
  }
}
