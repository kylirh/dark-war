/** Canonical runtime terrain mutation helpers for flat and layered levels. */

import { GameState, TileType } from "../types";

export function setStateTile(
  state: GameState,
  x: number,
  y: number,
  tile: TileType,
): boolean {
  const tileSource = state.tiles;
  const inBounds = tileSource
    ? tileSource.inBounds(x, y)
    : x >= 0 && y >= 0 && x < state.mapWidth && y < state.mapHeight;
  if (!inBounds) return false;
  tileSource?.setTile(x, y, tile);
  const index = x + y * state.mapWidth;
  state.map[index] = tileSource?.getTile(x, y) ?? tile;
  state.changedTiles?.add(index);
  return true;
}

export function setStateTileAtIndex(
  state: GameState,
  index: number,
  tile: TileType,
): boolean {
  if (index < 0 || index >= state.mapWidth * state.mapHeight) return false;
  return setStateTile(
    state,
    index % state.mapWidth,
    Math.floor(index / state.mapWidth),
    tile,
  );
}

export function setStateDamageAtIndex(
  state: GameState,
  index: number,
  damage: number,
): void {
  if (index < 0 || index >= state.mapWidth * state.mapHeight) return;
  const clamped = Math.max(0, Math.min(255, damage));
  state.wallDamage[index] = clamped;
  if (state.worldPlane) {
    state.worldPlane.layers.damage[index] = clamped;
  }
}
