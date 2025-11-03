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
 * Compute field of view using rot.js shadowcasting algorithm
 * More efficient and accurate than ray casting
 * Returns set of visible tile indices
 */
export function computeFOV(
  map: TileType[],
  player: Player,
  explored: Set<number>
): Set<number> {
  const visible = new Set<number>();
  const radius = player.sight;

  // Create rot.js FOV instance with shadowcasting
  const fov = new FOV.PreciseShadowcasting((x, y) => {
    // Return true if tile is transparent (light passes through)
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const tile = TILE_DEFINITIONS[tileAt(map, x, y)];
    return tile && !tile.opaque;
  });

  // Compute FOV from player position
  fov.compute(player.x, player.y, radius, (x, y, r, visibility) => {
    const index = idx(x, y);
    visible.add(index);
    explored.add(index);
  });

  return visible;
}
