import { FOV } from "rot-js";
import { TILE_DEFINITIONS, Player } from "../types";
import { TileSource } from "../core/tile-source";
import { idxFor } from "../utils/helpers";

/**
 * Compute field of view from any position using rot.js shadowcasting.
 * Reads tiles through a TileSource so it works over a flat level or a streaming
 * chunk source. Returns the set of visible tile indices.
 */
export function computeFOVFrom(
  tiles: TileSource,
  x: number,
  y: number,
  radius: number,
): Set<number> {
  const visible = new Set<number>();

  const fov = new FOV.PreciseShadowcasting((cx, cy) => {
    // Return true if the tile is transparent (light passes through).
    if (!tiles.inBounds(cx, cy)) return false;
    const def = TILE_DEFINITIONS[tiles.getTile(cx, cy)];
    return !!def && !def.opaque;
  });

  fov.compute(x, y, radius, (cx, cy) => {
    if (!tiles.inBounds(cx, cy)) return;
    visible.add(idxFor(cx, cy, tiles.width));
  });

  return visible;
}

/**
 * Compute the player's field of view and fold it into the explored set.
 * Returns the set of visible tile indices.
 */
export function computeFOV(
  tiles: TileSource,
  player: Player,
  explored: Set<number>,
): Set<number> {
  const visible = computeFOVFrom(tiles, player.gridX, player.gridY, player.sight);
  for (const index of visible) explored.add(index);
  return visible;
}
