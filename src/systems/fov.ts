import { FOV } from "rot-js";
import {
  TileType,
  TILE_DEFINITIONS,
  Player,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../types";
import { idxFor, tileAtFor } from "../utils/helpers";

/**
 * Compute field of view from any position using rot.js shadowcasting
 * Returns set of visible tile indices
 */
export function computeFOVFrom(
  map: TileType[],
  x: number,
  y: number,
  radius: number,
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
): Set<number> {
  const visible = new Set<number>();

  // Create rot.js FOV instance with shadowcasting
  const fov = new FOV.PreciseShadowcasting((x, y) => {
    // Return true if tile is transparent (light passes through)
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const tile = TILE_DEFINITIONS[tileAtFor(map, x, y, width, height)];
    return tile && !tile.opaque;
  });

  // Compute FOV from position
  fov.compute(x, y, radius, (x, y, r, visibility) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = idxFor(x, y, width);
    visible.add(index);
  });

  return visible;
}

/**
 * Compute field of view using rot.js shadowcasting algorithm
 * More efficient and accurate than ray casting
 * Returns set of visible tile indices
 */
export function computeFOV(
  map: TileType[],
  player: Player,
  explored: Set<number>,
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
): Set<number> {
  const visible = computeFOVFrom(
    map,
    player.gridX,
    player.gridY,
    player.sight,
    width,
    height,
  );

  // Add all visible tiles to explored
  for (const index of visible) {
    explored.add(index);
  }

  return visible;
}
