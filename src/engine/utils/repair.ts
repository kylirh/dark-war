import { GameState, TileType } from "../types";
import { isWallLikeTile } from "../core/tile-source";
import { idxFor, inBoundsFor } from "./helpers";
import {
  getStateDamageAtIndex,
  getStateTileAtIndex,
  setStateDamageAtIndex,
  setStateTileAtIndex,
} from "./state-tiles";

/** A tile worth repairing: a hole, or a damaged floor / wall-like tile. */
function isRepairable(tile: TileType, damage: number): boolean {
  if (tile === TileType.HOLE) return true;
  return damage > 0 && (tile === TileType.FLOOR || isWallLikeTile(tile));
}

export function applyRepairAt(
  state: GameState,
  x: number,
  y: number,
): "hole" | "damaged" | false {
  if (!inBoundsFor(x, y, state.mapWidth, state.mapHeight)) return false;
  const tileIndex = idxFor(x, y, state.mapWidth);
  const tile = getStateTileAtIndex(state, tileIndex);

  if (tile === TileType.HOLE) {
    setStateTileAtIndex(state, tileIndex, TileType.FLOOR);
    setStateDamageAtIndex(state, tileIndex, 0);
    state.mapDirty = true;
    return "hole";
  }

  const damage = getStateDamageAtIndex(state, tileIndex);
  if (damage <= 0) return false;

  const isWallLike = isWallLikeTile(tile);
  const isFloor = tile === TileType.FLOOR;

  if (!isWallLike && !isFloor) return false;

  const repairAmount = 3;
  const newDamage = Math.max(0, damage - repairAmount);
  setStateDamageAtIndex(state, tileIndex, newDamage);

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
      const tile = getStateTileAtIndex(state, idx);
      const damage = getStateDamageAtIndex(state, idx);
      if (!isRepairable(tile, damage)) continue;

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
  for (let i = 0; i < state.mapWidth * state.mapHeight; i++) {
    if (
      isRepairable(
        getStateTileAtIndex(state, i),
        getStateDamageAtIndex(state, i),
      )
    )
      return true;
  }
  return false;
}
