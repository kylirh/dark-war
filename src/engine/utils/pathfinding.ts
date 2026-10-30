import { Entity, EntityKind } from "../types";
import { TileSource } from "../core/tile-source";
import { idxFor, EIGHT_WAY_DIRECTIONS } from "./helpers";
import { wrapDelta, wrapValue } from "./wrap";

/**
 * `EIGHT_WAY_DIRECTIONS` split into two primitive arrays, in the same order.
 * The search below reads these 8 times per expanded cell, and the array-of-
 * pairs form costs a pointer chase per read; flattening it is most of the
 * speedup here. Derived from the shared constant rather than retyped, so the
 * tie-break order cannot drift away from it.
 */
const DIRECTION_DX = Int8Array.from(EIGHT_WAY_DIRECTIONS, (d) => d[0]);
const DIRECTION_DY = Int8Array.from(EIGHT_WAY_DIRECTIONS, (d) => d[1]);

/**
 * Scratch buffers for the breadth-first search below, reused across calls so a
 * search costs no allocation. Safe to share because the search is synchronous
 * and never reenters: it only reads from `tiles` and `explored` while running.
 *
 * They grow to fit the largest level seen and are never shrunk; the levels in
 * play are 128x96 and 128x72, so this settles at one allocation per process.
 */
let sharedCameFrom = new Int32Array(0);
let sharedDistance = new Int32Array(0);
let sharedVisitedOrder = new Int32Array(0);
let sharedQueue = new Int32Array(0);
let sharedHasMonster = new Uint8Array(0);

/** Grow the scratch buffers to fit a level; they are never shrunk. */
function ensureSearchCapacity(cellCount: number): void {
  if (sharedCameFrom.length >= cellCount) return;
  sharedCameFrom = new Int32Array(cellCount);
  sharedDistance = new Int32Array(cellCount);
  sharedVisitedOrder = new Int32Array(cellCount);
  sharedQueue = new Int32Array(cellCount);
  sharedHasMonster = new Uint8Array(cellCount);
}

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
 * Uses the shared scratch buffers above, so a search allocates nothing beyond
 * the returned path.
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
  ensureSearchCapacity(cellCount);

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

    // DIRECTION_DX/DY are EIGHT_WAY_DIRECTIONS in order, and that order is the
    // tie-break contract this search publishes (see helpers.ts): it decides
    // which equal-cost route comes back. Flatten it, do not reorder it.
    for (let d = 0; d < DIRECTION_DX.length; d++) {
      const stepX = currentX + DIRECTION_DX[d];
      const stepY = currentY + DIRECTION_DY[d];
      const nx = wraps ? wrapValue(stepX, width) : stepX;
      const ny = wraps ? wrapValue(stepY, height) : stepY;
      if (!tiles.inBounds(nx, ny) || (nx === currentX && ny === currentY)) {
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
