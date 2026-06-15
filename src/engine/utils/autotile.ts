/**
 * Cardinal-neighbor masks used to select connected tile artwork.
 */

export const AUTOTILE_NORTH = 1;
export const AUTOTILE_EAST = 2;
export const AUTOTILE_SOUTH = 4;
export const AUTOTILE_WEST = 8;

export type AutotileMask = number;

/**
 * Build a four-direction bitmask for the tile at the supplied coordinates.
 */
export function cardinalAutotileMask(
  x: number,
  y: number,
  connects: (neighborX: number, neighborY: number) => boolean,
): AutotileMask {
  let mask = 0;
  if (connects(x, y - 1)) mask |= AUTOTILE_NORTH;
  if (connects(x + 1, y)) mask |= AUTOTILE_EAST;
  if (connects(x, y + 1)) mask |= AUTOTILE_SOUTH;
  if (connects(x - 1, y)) mask |= AUTOTILE_WEST;
  return mask;
}
