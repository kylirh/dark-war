import {
  FLOOR_MAX_DAMAGE,
  GameState,
  TileType,
  WALL_MAX_DAMAGE,
} from "../types";
import { idxFor, inBoundsFor } from "./helpers";

export function applyRepairAt(
  state: GameState,
  x: number,
  y: number,
): "hole" | "damaged" | false {
  if (!inBoundsFor(x, y, state.mapWidth, state.mapHeight)) return false;
  const tileIndex = idxFor(x, y, state.mapWidth);
  const tile = state.map[tileIndex];

  if (tile === TileType.HOLE) {
    state.map[tileIndex] = TileType.FLOOR;
    state.wallDamage[tileIndex] = 0;
    state.mapDirty = true;
    return "hole";
  }

  const damage = state.wallDamage[tileIndex] ?? 0;
  if (damage <= 0) return false;

  const isWallLike =
    tile === TileType.WALL ||
    tile === TileType.DOOR_CLOSED ||
    tile === TileType.DOOR_OPEN ||
    tile === TileType.DOOR_LOCKED;
  const isFloor = tile === TileType.FLOOR;

  if (!isWallLike && !isFloor) return false;

  const repairAmount = 3;
  const newDamage = Math.max(0, damage - repairAmount);
  state.wallDamage[tileIndex] = newDamage;

  // If we fully repaired a wall-like tile, update mapDirty so physics syncs
  if (isWallLike && newDamage === 0) {
    state.mapDirty = true;
  }

  return "damaged";
}

/** Returns the grid [x, y] of the nearest repairable tile within radius, or null. */
export function findNearestRepairTarget(
  state: GameState,
  fromX: number,
  fromY: number,
  radius: number,
): [number, number] | null {
  let bestDist = Infinity;
  let bestCoord: [number, number] | null = null;

  const x0 = Math.max(0, fromX - radius);
  const x1 = Math.min(state.mapWidth - 1, fromX + radius);
  const y0 = Math.max(0, fromY - radius);
  const y1 = Math.min(state.mapHeight - 1, fromY + radius);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const idx = idxFor(tx, ty, state.mapWidth);
      const tile = state.map[idx];
      const damage = state.wallDamage[idx] ?? 0;
      const repairable =
        tile === TileType.HOLE ||
        ((tile === TileType.FLOOR ||
          tile === TileType.WALL ||
          tile === TileType.DOOR_CLOSED ||
          tile === TileType.DOOR_OPEN ||
          tile === TileType.DOOR_LOCKED) &&
          damage > 0);

      if (!repairable) continue;

      const dx = tx - fromX;
      const dy = ty - fromY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestCoord = [tx, ty];
      }
    }
  }

  return bestCoord;
}

/** Scan the entire level for any repairable tile. */
export function hasAnyRepairTarget(state: GameState): boolean {
  for (let i = 0; i < state.map.length; i++) {
    const tile = state.map[i];
    const damage = state.wallDamage[i] ?? 0;
    if (
      tile === TileType.HOLE ||
      ((tile === TileType.FLOOR ||
        tile === TileType.WALL ||
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_OPEN ||
        tile === TileType.DOOR_LOCKED) &&
        damage > 0)
    ) {
      return true;
    }
  }
  return false;
}
