import {
  FLOOR_MAX_DAMAGE,
  GameState,
  MAP_HEIGHT,
  MAP_WIDTH,
  TileType,
  WALL_MAX_DAMAGE,
} from "../types";
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
  const tile = state.map[tileIndex];
  const isDoor =
    tile === TileType.DOOR_CLOSED ||
    tile === TileType.DOOR_OPEN ||
    tile === TileType.DOOR_LOCKED;
  const isFloor = tile === TileType.FLOOR;
  const isWall = tile === TileType.WALL;

  if (!isWall && !isDoor && !isFloor) return false;

  // Ensure wallDamage is kept in sync with map length before accessing.
  if (state.wallDamage.length < state.map.length) {
    state.wallDamage.length = state.map.length;
  }

  const wallDamage = state.wallDamage;
  const current = wallDamage[tileIndex] ?? 0;
  const maxDamage = isFloor ? FLOOR_MAX_DAMAGE : WALL_MAX_DAMAGE;
  const next = Math.min(maxDamage, current + amount);
  wallDamage[tileIndex] = next;

  if (next >= maxDamage) {
    if (isFloor) {
      state.map[tileIndex] = TileType.HOLE;
      if (!state.holeCreatedTiles) {
        state.holeCreatedTiles = new Set();
      }
      state.holeCreatedTiles.add(tileIndex);
    } else {
      state.map[tileIndex] = TileType.FLOOR;
    }
    wallDamage[tileIndex] = 0;
    if (isWall || isDoor) {
      state.mapDirty = true;
    }
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
