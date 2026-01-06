import { Path } from "rot-js";
import { TileType, Entity, EntityKind, MAP_WIDTH } from "../types";
import { inBounds, passable, entityAt, idx } from "./helpers";

/**
 * Find a path from start to end using A* pathfinding
 * Returns the path as an array of coordinates, or null if no path exists
 */
export function findPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  map: TileType[],
  explored: Set<number>,
  entities: Entity[]
): [number, number][] | null {
  // Check if target is in bounds, passable, and explored
  if (!inBounds(endX, endY)) return null;
  if (!passable(map, endX, endY)) return null;
  
  // Check if destination is explored
  const destIdx = idx(endX, endY);
  if (!explored.has(destIdx)) return null;

  // Passable callback for rot.js pathfinding
  const passableCallback = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    
    // Check tile type - allow open doors, block closed/locked doors
    const tileIdx = idx(x, y);
    const tile = map[tileIdx];
    if (tile === TileType.WALL || tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_LOCKED) {
      return false;
    }
    
    // Only allow pathing through explored tiles
    if (!explored.has(tileIdx)) return false;
    
    // Check for monsters blocking the path (but allow destination to have a monster for attack)
    const isDestination = (x === endX && y === endY);
    if (!isDestination) {
      const monster = entities.find(e => e.x === x && e.y === y && e.kind === EntityKind.MONSTER);
      if (monster) return false;
    }
    
    return true;
  };

  // Create A* pathfinder - target is end position
  const astar = new Path.AStar(endX, endY, passableCallback, {
    topology: 8, // 8-directional movement
  });

  const path: [number, number][] = [];

  // Compute path from start to end
  astar.compute(startX, startY, (x, y) => {
    path.push([x, y]);
  });

  // Path includes start position as first element
  if (path.length > 1) {
    return path;
  }

  return null;
}
