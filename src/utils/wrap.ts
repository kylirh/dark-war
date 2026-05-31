/**
 * Toroidal (wrap-around) coordinate math.
 *
 * Level 0 (the outside world) is a torus: walking off one edge brings you back
 * on the opposite edge, so it appears infinite. Dungeon levels are bounded and
 * sealed, so they never actually reach a seam — the same engine code runs for
 * both, gated by a `wraps` flag (true only for the outside world).
 *
 * All functions are pure so the behaviour can be unit-tested without the
 * renderer/physics layers.
 */

/**
 * Fold a value into the half-open range `[0, span)`.
 * Works for negative inputs and inputs many spans out of range.
 */
export function wrapValue(value: number, span: number): number {
  if (span <= 0) return value;
  return ((value % span) + span) % span;
}

/**
 * Shortest signed distance to travel from `from` to `to` on a ring of size
 * `span`. The result lies in `[-span/2, span/2)`. Use this for directions and
 * distances that should take the short way around the seam.
 */
export function wrapDelta(from: number, to: number, span: number): number {
  if (span <= 0) return to - from;
  const half = span / 2;
  return wrapValue(to - from + half, span) - half;
}

/**
 * The image of `value` (i.e. `value + k*span`) that sits closest to
 * `reference`. Used by the renderer to draw an entity near the seam on the side
 * of the screen the camera is looking at, and by aiming to point the short way.
 */
export function nearestWrappedImage(
  value: number,
  reference: number,
  span: number,
): number {
  if (span <= 0) return value;
  return reference + wrapDelta(reference, value, span);
}
