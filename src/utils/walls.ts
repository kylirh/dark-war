import { GameState, TileType } from "../types";

export const WALL_MAX_HP = 6;
const WALL_DAMAGE_STAGE_ONE = 4;
const WALL_DAMAGE_STAGE_TWO = 2;

export function createWallHealth(map: TileType[]): number[] {
  return map.map((tile) => (tile === TileType.WALL ? WALL_MAX_HP : 0));
}

export function applyWallDamage(
  state: GameState,
  tileIndex: number,
  amount: number,
): boolean {
  if (state.map[tileIndex] !== TileType.WALL) return false;

  const current = state.wallHealth[tileIndex] ?? WALL_MAX_HP;
  const next = Math.max(0, current - amount);
  state.wallHealth[tileIndex] = next;

  if (next <= 0) {
    state.map[tileIndex] = TileType.FLOOR;
    state.wallHealth[tileIndex] = 0;
    state.pendingWallRemovals.push(tileIndex);
    return true;
  }

  return false;
}

export function getWallSpriteKey(health: number): string | number {
  if (health <= WALL_DAMAGE_STAGE_TWO) {
    return "wall_damaged_2";
  }

  if (health <= WALL_DAMAGE_STAGE_ONE) {
    return "wall_damaged_1";
  }

  return TileType.WALL;
}
