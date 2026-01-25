import { GameState, TileType, WALL_MAX_DAMAGE } from "../types";
import { idx, inBounds } from "./helpers";

export function applyWallDamageAtIndex(
  state: GameState,
  tileIndex: number,
  amount: number,
): boolean {
  if (tileIndex < 0 || tileIndex >= state.map.length) return false;
  if (state.map[tileIndex] !== TileType.WALL) return false;

  const current = state.wallDamage[tileIndex] || 0;
  const next = Math.min(WALL_MAX_DAMAGE, current + amount);
  state.wallDamage[tileIndex] = next;

  if (next >= WALL_MAX_DAMAGE) {
    state.map[tileIndex] = TileType.FLOOR;
    state.wallDamage[tileIndex] = 0;
    state.mapDirty = true;
    return true;
  }

  return true;
}

export function applyWallDamageAt(
  state: GameState,
  x: number,
  y: number,
  amount: number,
): boolean {
  if (!inBounds(x, y)) return false;
  return applyWallDamageAtIndex(state, idx(x, y), amount);
}
