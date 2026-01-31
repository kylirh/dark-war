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
  if (!inBounds(x, y)) return TileType.WALL;
  return map[idx(x, y)];
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
 * Check if tile is passable (not blocked)
 */
export function passable(map: TileType[], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
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
  y: number,
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
  filter?: (e: Entity) => boolean,
): Entity | undefined {
  return entities.find(
    (e) => e.gridX === x && e.gridY === y && (!filter || filter(e)),
  );
}

/**
 * Find all entities at coordinates
 */
export function entitiesAt(entities: Entity[], x: number, y: number): Entity[] {
  return entities.filter((e) => e.gridX === x && e.gridY === y);
}

/**
 * Calculate Manhattan distance between two points
 */
export function dist(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
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

/**
 * Teleport entity to center of a grid cell
 * Sets both worldX/worldY and prevWorldX/prevWorldY for immediate position change
 */
export function setPositionFromGrid(
  entity: Entity,
  gridX: number,
  gridY: number,
): void {
  const CELL_W = 32;
  const CELL_H = 32;
  entity.worldX = gridX * CELL_W + CELL_W / 2;
  entity.worldY = gridY * CELL_H + CELL_H / 2;
  entity.prevWorldX = entity.worldX;
  entity.prevWorldY = entity.worldY;
}
