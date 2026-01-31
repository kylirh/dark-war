import { GameState, TileType, WALL_MAX_DAMAGE, MAP_WIDTH, MAP_HEIGHT } from "../types";
import { idx, inBounds } from "./helpers";

export function applyWallDamageAtIndex(
  state: GameState,
  tileIndex: number,
  amount: number,
): boolean {
  if (tileIndex < 0 || tileIndex >= state.map.length) return false;
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const x = tileIndex % width;
  const y = Math.floor(tileIndex / width);
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return false;
  }
  if (state.map[tileIndex] !== TileType.WALL) return false;

  // Ensure wallDamage is kept in sync with map length before accessing.
  if (state.wallDamage.length < state.map.length) {
    state.wallDamage.length = state.map.length;
  }

  const wallDamage = state.wallDamage;
  const current = wallDamage[tileIndex] ?? 0;
  const next = Math.min(WALL_MAX_DAMAGE, current + amount);
  wallDamage[tileIndex] = next;

  if (next >= WALL_MAX_DAMAGE) {
    state.map[tileIndex] = TileType.FLOOR;
    wallDamage[tileIndex] = 0;
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
