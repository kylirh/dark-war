import {
  FLOOR_MAX_DAMAGE,
  GameState,
  ItemType,
  TileType,
  WALL_MAX_DAMAGE,
} from "../types";
import { isWallLikeTile } from "../core/tile-source";
import { ItemEntity } from "../entities/item-entity";
import { RNG } from "./rng";
import { idxFor, inBoundsFor } from "./helpers";

/** A destroyed wall leaves rubble behind (and sometimes a throwable rock). */
function spawnRubble(state: GameState, x: number, y: number): void {
  // Some headless/test states have no entity manager — nothing to drop into.
  if (typeof state.entityManager?.spawn !== "function") return;
  state.entityManager.spawn(new ItemEntity(x, y, ItemType.RUBBLE_CHUNK));
  if (RNG.chance(0.35)) {
    state.entityManager.spawn(new ItemEntity(x, y, ItemType.ROCK));
  }
}

export function applyWallDamageAtIndex(
  state: GameState,
  tileIndex: number,
  amount: number,
): boolean {
  if (tileIndex < 0 || tileIndex >= state.map.length) return false;
  const width = state.mapWidth;
  const height = state.mapHeight;
  const x = tileIndex % width;
  const y = Math.floor(tileIndex / width);
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return false;
  }
  const tile = state.map[tileIndex];
  const isFloor = tile === TileType.FLOOR;
  const isWallLike = isWallLikeTile(tile);

  if (!isWallLike && !isFloor) return false;

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
    if (isWallLike) {
      state.mapDirty = true;
      spawnRubble(state, x, y);
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
  if (!inBoundsFor(x, y, state.mapWidth, state.mapHeight)) return false;
  return applyWallDamageAtIndex(state, idxFor(x, y, state.mapWidth), amount);
}
