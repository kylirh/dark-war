import { FOV } from "rot-js";
import {
  TileType,
  TILE_DEFINITIONS,
  Player,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../types";
import { tileAt, idx } from "../utils/helpers";

/**
 * Compute field of view from any position using rot.js shadowcasting
 * Returns set of visible tile indices
 */
export function computeFOVFrom(
  map: TileType[],
  x: number,
  y: number,
  radius: number
): Set<number> {
  const visible = new Set<number>();

  // Create rot.js FOV instance with shadowcasting
  const fov = new FOV.PreciseShadowcasting((x, y) => {
    // Return true if tile is transparent (light passes through)
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const tile = TILE_DEFINITIONS[tileAt(map, x, y)];
    return tile && !tile.opaque;
  });

  // Compute FOV from position
  fov.compute(x, y, radius, (x, y, r, visibility) => {
    const index = idx(x, y);
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
  explored: Set<number>
): Set<number> {
  const visible = computeFOVFrom(map, player.x, player.y, player.sight);

  // Add all visible tiles to explored
  visible.forEach((index) => explored.add(index));

  // Limit explored set size to prevent unbounded memory growth
  // Keep only the most recently explored tiles (last 2000)
  if (explored.size > 2000) {
    const toKeep = Array.from(explored).slice(-1500);
    explored.clear();
    toKeep.forEach((i) => explored.add(i));
  }

  return visible;
}
