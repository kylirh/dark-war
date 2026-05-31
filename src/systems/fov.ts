import { FOV } from "rot-js";
import { TILE_DEFINITIONS, Player } from "../types";
import { TileSource } from "../core/tile-source";
import { idxFor } from "../utils/helpers";
import { wrapValue } from "../utils/wrap";

/**
 * Compute field of view from any position using rot.js shadowcasting.
 * Reads tiles through a TileSource so it works over a flat level. Returns the
 * set of visible tile indices.
 *
 * When `wraps` is true (the toroidal outside world) the shadowcaster's probe
 * coordinates are folded back onto the map, so sight lines continue across the
 * seam and the tiles on the far edge light up as if adjacent.
 */
export function computeFOVFrom(
  tiles: TileSource,
  x: number,
  y: number,
  radius: number,
  wraps: boolean = false,
): Set<number> {
  const visible = new Set<number>();
  const w = tiles.width;
  const h = tiles.height;

  const fov = new FOV.PreciseShadowcasting((cx, cy) => {
    let tx = cx;
    let ty = cy;
    if (wraps) {
      tx = wrapValue(cx, w);
      ty = wrapValue(cy, h);
    } else if (!tiles.inBounds(cx, cy)) {
      return false;
    }
    // Return true if the tile is transparent (light passes through).
    const def = TILE_DEFINITIONS[tiles.getTile(tx, ty)];
    return !!def && !def.opaque;
  });

  fov.compute(x, y, radius, (cx, cy) => {
    let tx = cx;
    let ty = cy;
    if (wraps) {
      tx = wrapValue(cx, w);
      ty = wrapValue(cy, h);
    } else if (!tiles.inBounds(cx, cy)) {
      return;
    }
    visible.add(idxFor(tx, ty, w));
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
  wraps: boolean = false,
): Set<number> {
  const visible = computeFOVFrom(
    tiles,
    player.gridX,
    player.gridY,
    player.sight,
    wraps,
  );
  for (const index of visible) explored.add(index);
  return visible;
}
