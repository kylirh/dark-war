/**
 * Pure neighborhood classifiers for soft-ground and shoreline transitions.
 *
 * Blob masks describe a semantic cell and its eight neighbors. Dual-grid masks
 * describe the four semantic cells meeting at a display-grid vertex.
 */

export const TRANSITION_NORTH = 1 << 0;
export const TRANSITION_NORTH_EAST = 1 << 1;
export const TRANSITION_EAST = 1 << 2;
export const TRANSITION_SOUTH_EAST = 1 << 3;
export const TRANSITION_SOUTH = 1 << 4;
export const TRANSITION_SOUTH_WEST = 1 << 5;
export const TRANSITION_WEST = 1 << 6;
export const TRANSITION_NORTH_WEST = 1 << 7;

export const DUAL_GRID_NORTH_WEST = 1 << 0;
export const DUAL_GRID_NORTH_EAST = 1 << 1;
export const DUAL_GRID_SOUTH_EAST = 1 << 2;
export const DUAL_GRID_SOUTH_WEST = 1 << 3;

export type BlobTransitionMask = number;
export type DualGridTransitionMask = number;

interface NeighborOffset {
  readonly dx: number;
  readonly dy: number;
  readonly bit: number;
}

const BLOB_NEIGHBORS: readonly NeighborOffset[] = [
  { dx: 0, dy: -1, bit: TRANSITION_NORTH },
  { dx: 1, dy: -1, bit: TRANSITION_NORTH_EAST },
  { dx: 1, dy: 0, bit: TRANSITION_EAST },
  { dx: 1, dy: 1, bit: TRANSITION_SOUTH_EAST },
  { dx: 0, dy: 1, bit: TRANSITION_SOUTH },
  { dx: -1, dy: 1, bit: TRANSITION_SOUTH_WEST },
  { dx: -1, dy: 0, bit: TRANSITION_WEST },
  { dx: -1, dy: -1, bit: TRANSITION_NORTH_WEST },
];

/** Remove impossible diagonal connections, reducing 256 masks to 47. */
export function normalizeBlobTransitionMask(mask: number): BlobTransitionMask {
  let normalized = mask & 0xff;
  if (!(normalized & TRANSITION_NORTH) || !(normalized & TRANSITION_EAST)) {
    normalized &= ~TRANSITION_NORTH_EAST;
  }
  if (!(normalized & TRANSITION_EAST) || !(normalized & TRANSITION_SOUTH)) {
    normalized &= ~TRANSITION_SOUTH_EAST;
  }
  if (!(normalized & TRANSITION_SOUTH) || !(normalized & TRANSITION_WEST)) {
    normalized &= ~TRANSITION_SOUTH_WEST;
  }
  if (!(normalized & TRANSITION_WEST) || !(normalized & TRANSITION_NORTH)) {
    normalized &= ~TRANSITION_NORTH_WEST;
  }
  return normalized;
}

/** Resolve the canonical blob mask for a semantic cell. */
export function resolveBlobTransitionMask(
  x: number,
  y: number,
  connects: (sampleX: number, sampleY: number) => boolean,
): BlobTransitionMask {
  let mask = 0;
  for (const neighbor of BLOB_NEIGHBORS) {
    if (connects(x + neighbor.dx, y + neighbor.dy)) {
      mask |= neighbor.bit;
    }
  }
  return normalizeBlobTransitionMask(mask);
}

/** Resolve the four semantic corners meeting at a display-grid vertex. */
export function resolveDualGridTransitionMask(
  vertexX: number,
  vertexY: number,
  connects: (sampleX: number, sampleY: number) => boolean,
): DualGridTransitionMask {
  let mask = 0;
  if (connects(vertexX - 1, vertexY - 1)) mask |= DUAL_GRID_NORTH_WEST;
  if (connects(vertexX, vertexY - 1)) mask |= DUAL_GRID_NORTH_EAST;
  if (connects(vertexX, vertexY)) mask |= DUAL_GRID_SOUTH_EAST;
  if (connects(vertexX - 1, vertexY)) mask |= DUAL_GRID_SOUTH_WEST;
  return mask;
}
