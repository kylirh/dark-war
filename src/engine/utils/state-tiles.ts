/** Canonical runtime terrain mutation helpers for flat and layered levels. */

import { GameState, TileType } from "../types";
import { WorldCellLayerEdit } from "../core/world-plane";

export function getStateTileAtIndex(state: GameState, index: number): TileType {
  if (index < 0 || index >= state.mapWidth * state.mapHeight) {
    return TileType.WALL;
  }
  return state.tiles.getTile(
    index % state.mapWidth,
    Math.floor(index / state.mapWidth),
  );
}

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

export function editStateCell(
  state: GameState,
  x: number,
  y: number,
  edit: WorldCellLayerEdit,
): readonly number[] {
  const dirty = state.worldPlane.editCell(x, y, edit);
  for (const index of dirty) state.changedTiles?.add(index);
  return dirty;
}

export function setStateDamageAtIndex(
  state: GameState,
  index: number,
  damage: number,
): void {
  if (index < 0 || index >= state.mapWidth * state.mapHeight) return;
  const clamped = Math.max(0, Math.min(255, damage));
  state.worldPlane.layers.damage[index] = clamped;
}

export function getStateDamageAtIndex(state: GameState, index: number): number {
  if (index < 0 || index >= state.mapWidth * state.mapHeight) return 0;
  return state.worldPlane.layers.damage[index] ?? 0;
}
