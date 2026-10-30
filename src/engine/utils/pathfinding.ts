import { Entity, EntityKind } from "../types";
import { TileSource } from "../core/tile-source";
import { idxFor } from "./helpers";
import { wrapDelta, wrapValue } from "./wrap";

const MAX_CELLS = 256 * 256;
const sharedCameFrom = new Int32Array(MAX_CELLS);
const sharedDistance = new Int32Array(MAX_CELLS);
const sharedVisitedOrder = new Int32Array(MAX_CELLS);
const sharedQueue = new Int32Array(MAX_CELLS);
const sharedHasMonster = new Uint8Array(MAX_CELLS);

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
  wraps = false,
): [number, number][] | null {
  const path = findPathToClosestReachable(
    startX,
    startY,
    endX,
    endY,
    tiles,
    explored,
    entities,
    wraps,
  );
  const destination = path?.[path.length - 1];
  return destination?.[0] === endX && destination[1] === endY ? path : null;
}

/**
 * Find a path to the target, or the closest reachable tile if target is blocked/unknown.
 * Memory constraint: uses module-scoped buffers sized up to MAX_CELLS for O(1) allocation.
 */
export function findPathToClosestReachable(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  tiles: TileSource,
  explored: Set<number>,
  entities: Entity[],
  wraps = false,
): [number, number][] | null {
  const { width, height } = tiles;
  if (!tiles.inBounds(endX, endY)) return null;

  const cellCount = width * height;

  if (cellCount > MAX_CELLS) {
    throw new Error(
      `Map too large for pathfinding arrays: ${cellCount} cells, max ${MAX_CELLS}`,
    );
  }

  sharedCameFrom.fill(-1, 0, cellCount);
  sharedDistance.fill(-1, 0, cellCount);
  let visitedCount = 0;

  const startIdx = idxFor(startX, startY, width);
  let queueTail = 0;
  sharedQueue[queueTail++] = startIdx;
  sharedDistance[startIdx] = 0;
  sharedVisitedOrder[visitedCount++] = startIdx;

  const isPassable = (x: number, y: number): boolean => {
    if (!tiles.inBounds(x, y)) return false;
    const tileIdx = idxFor(x, y, width);

    if (!tiles.passable(x, y)) return false;

    if (!explored.has(tileIdx)) return false;

    return true;
  };

  sharedHasMonster.fill(0, 0, cellCount);
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.kind === EntityKind.MONSTER) {
      sharedHasMonster[idxFor(e.gridX, e.gridY, width)] = 1;
    }
  }

  let head = 0;
  while (head < queueTail) {
    const current = sharedQueue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        let nx = currentX + dx;
        let ny = currentY + dy;

        if (wraps) {
          nx = wrapValue(nx, width);
          ny = wrapValue(ny, height);
        }

        if (!tiles.inBounds(nx, ny)) {
          continue;
        }

        const nIdx = idxFor(nx, ny, width);
        if (sharedDistance[nIdx] !== -1) continue;

        if (!isPassable(nx, ny)) continue;
        if (!tiles.canTraverse(currentX, currentY, nx, ny, wraps)) continue;

        if (sharedHasMonster[nIdx] === 1 && !(nx === endX && ny === endY)) {
          continue;
        }

        sharedDistance[nIdx] = sharedDistance[current] + 1;
        sharedCameFrom[nIdx] = current;
        sharedQueue[queueTail++] = nIdx;
        sharedVisitedOrder[visitedCount++] = nIdx;
      }
    }
  }

  const targetIdx = idxFor(endX, endY, width);
  let destinationIdx = targetIdx;
  if (sharedDistance[targetIdx] === -1 || !tiles.passable(endX, endY)) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestSteps = Number.POSITIVE_INFINITY;

    for (let i = 0; i < visitedCount; i++) {
      const tileIdx = sharedVisitedOrder[i];
      const x = tileIdx % width;
      const y = Math.floor(tileIdx / width);

      const dx = wraps ? wrapDelta(x, endX, width) : x - endX;
      const dy = wraps ? wrapDelta(y, endY, height) : y - endY;

      const distSq = dx * dx + dy * dy;
      const steps = sharedDistance[tileIdx];

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
    currentIdx = sharedCameFrom[currentIdx];
  }

  if (path.length > 0) {
    path.reverse();
  }

  return path.length > 1 ? path : null;
}
