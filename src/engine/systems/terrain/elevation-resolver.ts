/**
 * Pure elevation-neighborhood classification for terrain visual resolvers.
 *
 * The result describes relative topology only. Renderers map these masks and
 * magnitudes to authored cliff, stair, shadow, or chasm artwork.
 */

export const ELEVATION_NORTH = 1 << 0;
export const ELEVATION_NORTH_EAST = 1 << 1;
export const ELEVATION_EAST = 1 << 2;
export const ELEVATION_SOUTH_EAST = 1 << 3;
export const ELEVATION_SOUTH = 1 << 4;
export const ELEVATION_SOUTH_WEST = 1 << 5;
export const ELEVATION_WEST = 1 << 6;
export const ELEVATION_NORTH_WEST = 1 << 7;

export type ElevationNeighborMask = number;
export type CliffMagnitude = "none" | "step" | "tall";

export interface ElevationVisualContext {
  elevation: number;
  lowerNeighborMask: ElevationNeighborMask;
  higherNeighborMask: ElevationNeighborMask;
  maximumDrop: number;
  maximumRise: number;
}

interface NeighborOffset {
  dx: number;
  dy: number;
  bit: number;
}

const NEIGHBOR_OFFSETS: readonly NeighborOffset[] = [
  { dx: 0, dy: -1, bit: ELEVATION_NORTH },
  { dx: 1, dy: -1, bit: ELEVATION_NORTH_EAST },
  { dx: 1, dy: 0, bit: ELEVATION_EAST },
  { dx: 1, dy: 1, bit: ELEVATION_SOUTH_EAST },
  { dx: 0, dy: 1, bit: ELEVATION_SOUTH },
  { dx: -1, dy: 1, bit: ELEVATION_SOUTH_WEST },
  { dx: -1, dy: 0, bit: ELEVATION_WEST },
  { dx: -1, dy: -1, bit: ELEVATION_NORTH_WEST },
];

/**
 * Classify all eight neighbors relative to the center elevation.
 *
 * Boundary behavior belongs to the caller: a bounded plane may return the
 * center height, while a wrapping plane may wrap the supplied coordinates.
 */
export function resolveElevationVisualContext(
  x: number,
  y: number,
  elevationAt: (sampleX: number, sampleY: number) => number,
): ElevationVisualContext {
  const elevation = elevationAt(x, y);
  let lowerNeighborMask = 0;
  let higherNeighborMask = 0;
  let maximumDrop = 0;
  let maximumRise = 0;

  for (const neighbor of NEIGHBOR_OFFSETS) {
    const neighborElevation = elevationAt(x + neighbor.dx, y + neighbor.dy);
    const difference = elevation - neighborElevation;

    if (difference > 0) {
      lowerNeighborMask |= neighbor.bit;
      maximumDrop = Math.max(maximumDrop, difference);
    } else if (difference < 0) {
      higherNeighborMask |= neighbor.bit;
      maximumRise = Math.max(maximumRise, -difference);
    }
  }

  return {
    elevation,
    lowerNeighborMask,
    higherNeighborMask,
    maximumDrop,
    maximumRise,
  };
}

/**
 * Collapse arbitrary logical height differences into a bounded visual family.
 * A tall cliff uses authored constant-cost artwork rather than one sprite per
 * elevation step.
 */
export function cliffMagnitudeForDrop(drop: number): CliffMagnitude {
  if (drop <= 0) return "none";
  if (drop === 1) return "step";
  return "tall";
}
