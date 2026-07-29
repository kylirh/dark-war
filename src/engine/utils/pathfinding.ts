import { Path } from "rot-js";
import { Entity, EntityKind, TILE_DEFINITIONS } from "../types";
import { TileSource } from "../core/tile-source";
import { idxFor } from "./helpers";

/**
 * Find a path from start to end using A* pathfinding
 * Returns the path as an array of coordinates, or null if no path exists
 */
export function findPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  tiles: TileSource,
  explored: Set<number>,
  entities: Entity[],
): [number, number][] | null {
  const { width, height } = tiles;
  // Check if target is in bounds, passable, and explored
  if (!tiles.inBounds(endX, endY)) return null;
  if (!tiles.passable(endX, endY)) return null;

  // Check if destination is explored
  const destIdx = idxFor(endX, endY, width);
  if (!explored.has(destIdx)) return null;

  // Passable callback for rot.js pathfinding
  const passableCallback = (x: number, y: number): boolean => {
    if (!tiles.inBounds(x, y)) return false;

    // Check tile type - allow open doors, block closed/locked doors
    const tileIdx = idxFor(x, y, width);
    const tile = tiles.getTile(x, y);
    if (TILE_DEFINITIONS[tile]?.block) {
      return false;
    }

    // Only allow pathing through explored tiles
    if (!explored.has(tileIdx)) return false;

    // Check for monsters blocking the path (but allow destination to have a monster for attack)
    const isDestination = x === endX && y === endY;
    if (!isDestination) {
      const monster = entities.find(
        (e) => e.gridX === x && e.gridY === y && e.kind === EntityKind.MONSTER,
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
  tiles: TileSource,
  explored: Set<number>,
  entities: Entity[],
): [number, number][] | null {
  const { width, height } = tiles;
  if (!tiles.inBounds(endX, endY)) return null;

  const cellCount = width * height;
  const cameFrom = new Array<number>(cellCount).fill(-1);
  const distance = new Array<number>(cellCount).fill(-1);
  const visitedOrder: number[] = [];

  const startIdx = idxFor(startX, startY, width);
  const queue: number[] = [startIdx];
  distance[startIdx] = 0;
  visitedOrder.push(startIdx);

  const isPassable = (x: number, y: number): boolean => {
    if (!tiles.inBounds(x, y)) return false;
    const tileIdx = idxFor(x, y, width);

    const tile = tiles.getTile(x, y);
    if (TILE_DEFINITIONS[tile]?.block) {
      return false;
    }

    if (!explored.has(tileIdx)) return false;

    return true;
  };

  const monsterTiles = new Set<number>();
  for (const e of entities) {
    if (e.kind === EntityKind.MONSTER) {
      monsterTiles.add(idxFor(e.gridX, e.gridY, width));
    }
  }
  const hasMonster = (x: number, y: number): boolean =>
    monsterTiles.has(idxFor(x, y, width));

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

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);

    for (const [dx, dy] of directions) {
      const nx = currentX + dx;
      const ny = currentY + dy;
      if (!tiles.inBounds(nx, ny)) continue;

      const nIdx = idxFor(nx, ny, width);
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

  const targetIdx = idxFor(endX, endY, width);
  let destinationIdx = targetIdx;
  if (distance[targetIdx] === -1 || !tiles.passable(endX, endY)) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestSteps = Number.POSITIVE_INFINITY;

    for (const tileIdx of visitedOrder) {
      const x = tileIdx % width;
      const y = Math.floor(tileIdx / width);
      const dx = x - endX;
      const dy = y - endY;
      const distSq = dx * dx + dy * dy;
      const steps = distance[tileIdx];

      if (distSq < bestDist || (distSq === bestDist && steps < bestSteps)) {
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
    const x = currentIdx % width;
    const y = Math.floor(currentIdx / width);
    path.push([x, y]);
    if (currentIdx === startIdx) break;
    currentIdx = cameFrom[currentIdx];
  }

  if (path.length > 0) {
    path.reverse();
  }

  return path.length > 1 ? path : null;
}
