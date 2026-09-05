/**
 * Pure helpers for remembering and validating the Electron window rectangle.
 * Kept free of Electron imports so the off-screen recovery rule is testable.
 */

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 920;
const MIN_VISIBLE_FRACTION = 0.5;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Normalize persisted bounds while enforcing the application's minimum size. */
function normalizeWindowBounds(value, minWidth, minHeight) {
  if (!value || typeof value !== "object") return null;
  if (
    !finiteNumber(value.x) ||
    !finiteNumber(value.y) ||
    !finiteNumber(value.width) ||
    !finiteNumber(value.height)
  ) {
    return null;
  }

  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.max(minWidth, Math.round(value.width)),
    height: Math.max(minHeight, Math.round(value.height)),
  };
}

function workAreaForDisplay(display) {
  return display?.workArea ?? display?.bounds ?? null;
}

/**
 * Decide whether enough of a window would be visible on the current displays.
 * A rectangle with less than half its area visible is treated as lost so the
 * next launch can recover it without requiring the user to hunt for the app.
 */
function isWindowBoundsVisible(
  bounds,
  displays,
  minVisibleFraction = MIN_VISIBLE_FRACTION,
) {
  if (
    !bounds ||
    !finiteNumber(bounds.x) ||
    !finiteNumber(bounds.y) ||
    !finiteNumber(bounds.width) ||
    !finiteNumber(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !Array.isArray(displays) ||
    displays.length === 0
  ) {
    return false;
  }

  const windowArea = bounds.width * bounds.height;
  let visibleArea = 0;
  for (const display of displays) {
    const workArea = workAreaForDisplay(display);
    if (!workArea) continue;

    const left = Math.max(bounds.x, workArea.x);
    const top = Math.max(bounds.y, workArea.y);
    const right = Math.min(
      bounds.x + bounds.width,
      workArea.x + workArea.width,
    );
    const bottom = Math.min(
      bounds.y + bounds.height,
      workArea.y + workArea.height,
    );
    if (right > left && bottom > top) {
      visibleArea += (right - left) * (bottom - top);
    }
  }

  return visibleArea / windowArea >= minVisibleFraction;
}

module.exports = {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_VISIBLE_FRACTION,
  isWindowBoundsVisible,
  normalizeWindowBounds,
};
