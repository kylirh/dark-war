import { Path } from "rot-js";
import { TileType, Entity, EntityKind, MAP_WIDTH } from "../types";
import { inBounds, passable, idx } from "./helpers";

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
    if (
      tile === TileType.WALL ||
      tile === TileType.DOOR_CLOSED ||
      tile === TileType.DOOR_LOCKED
    ) {
      return false;
    }

    // Only allow pathing through explored tiles
    if (!explored.has(tileIdx)) return false;

    // Check for monsters blocking the path (but allow destination to have a monster for attack)
    const isDestination = x === endX && y === endY;
    if (!isDestination) {
      const monster = entities.find(
        (e) => e.x === x && e.y === y && e.kind === EntityKind.MONSTER
      );
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

/**
 * Find a path to the target, or the closest reachable tile if target is blocked/unknown.
 */
export function findPathToClosestReachable(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  map: TileType[],
  explored: Set<number>,
  entities: Entity[]
): [number, number][] | null {
  if (!inBounds(endX, endY)) return null;

  const cameFrom = new Array<number>(map.length).fill(-1);
  const distance = new Array<number>(map.length).fill(-1);
  const visitedOrder: number[] = [];

  const startIdx = idx(startX, startY);
  const queue: number[] = [startIdx];
  distance[startIdx] = 0;
  visitedOrder.push(startIdx);

  const isPassable = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    const tileIdx = idx(x, y);

    const tile = map[tileIdx];
    if (
      tile === TileType.WALL ||
      tile === TileType.DOOR_CLOSED ||
      tile === TileType.DOOR_LOCKED
    ) {
      return false;
    }

    if (!explored.has(tileIdx)) return false;

    return true;
  };

  const hasMonster = (x: number, y: number): boolean =>
    entities.some(
      (e) => e.x === x && e.y === y && e.kind === EntityKind.MONSTER
    );

  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentX = current % MAP_WIDTH;
    const currentY = Math.floor(current / MAP_WIDTH);

    for (const [dx, dy] of directions) {
      const nx = currentX + dx;
      const ny = currentY + dy;
      if (!inBounds(nx, ny)) continue;

      const nIdx = idx(nx, ny);
      if (distance[nIdx] !== -1) continue;

      if (!isPassable(nx, ny)) continue;

      if (hasMonster(nx, ny) && !(nx === endX && ny === endY)) {
        continue;
      }

      distance[nIdx] = distance[current] + 1;
      cameFrom[nIdx] = current;
      queue.push(nIdx);
      visitedOrder.push(nIdx);
    }
  }

  const targetIdx = idx(endX, endY);
  let destinationIdx = targetIdx;
  if (distance[targetIdx] === -1 || !passable(map, endX, endY)) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestSteps = Number.POSITIVE_INFINITY;

    for (const tileIdx of visitedOrder) {
      const x = tileIdx % MAP_WIDTH;
      const y = Math.floor(tileIdx / MAP_WIDTH);
      const dx = x - endX;
      const dy = y - endY;
      const distSq = dx * dx + dy * dy;
      const steps = distance[tileIdx];

      if (
        distSq < bestDist ||
        (distSq === bestDist && steps < bestSteps)
      ) {
        bestDist = distSq;
        bestSteps = steps;
        bestIdx = tileIdx;
      }
    }

    if (bestIdx === -1) {
      return null;
    }

    destinationIdx = bestIdx;
  }

  const path: [number, number][] = [];
  let currentIdx = destinationIdx;
  while (currentIdx !== -1) {
    const x = currentIdx % MAP_WIDTH;
    const y = Math.floor(currentIdx / MAP_WIDTH);
    path.push([x, y]);
    if (currentIdx === startIdx) break;
    currentIdx = cameFrom[currentIdx];
  }

  if (path.length > 0) {
    path.reverse();
  }

  return path.length > 1 ? path : null;
}
