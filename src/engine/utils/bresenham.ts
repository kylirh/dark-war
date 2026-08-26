/**
 * Bresenham line traversal.
 *
 * Shared by every grid raycast in the engine (physics line-of-sight, AI
 * line-of-sight). Callback-driven rather than array-returning so callers can
 * bail out on the first blocking tile without allocating the whole line.
 */

/**
 * Walk the integer grid cells on the line from (x0, y0) to (x1, y1), inclusive
 * of both endpoints.
 *
 * @param callback Invoked per cell. Return false to stop the walk early.
 * @returns false if the callback stopped the walk, true if the line completed.
 */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  callback: (x: number, y: number) => boolean,
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  for (;;) {
    if (!callback(x, y)) return false;

    if (x === x1 && y === y1) return true;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
