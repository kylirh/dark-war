import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { isWindowBoundsVisible, normalizeWindowBounds } = createRequire(
  import.meta.url,
)("./window-state.js") as {
  isWindowBoundsVisible: (
    bounds: Bounds,
    displays: Display[],
    minVisibleFraction?: number,
  ) => boolean;
  normalizeWindowBounds: (
    value: Partial<Bounds>,
    minWidth: number,
    minHeight: number,
  ) => Bounds | null;
};

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Display = {
  workArea: Bounds;
};

const PRIMARY_DISPLAY: Display = {
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

describe("window state", () => {
  it("normalizes persisted bounds and enforces minimum dimensions", () => {
    expect(
      normalizeWindowBounds(
        { x: 12.4, y: -5.6, width: 640, height: 480 },
        960,
        640,
      ),
    ).toEqual({ x: 12, y: -6, width: 960, height: 640 });
  });

  it("rejects malformed persisted bounds", () => {
    expect(
      normalizeWindowBounds(
        { x: 10, y: 20, width: Number.NaN, height: 600 },
        960,
        640,
      ),
    ).toBeNull();
  });

  it("accepts a window with at least half its area visible", () => {
    expect(
      isWindowBoundsVisible({ x: 100, y: 100, width: 1000, height: 700 }, [
        PRIMARY_DISPLAY,
      ]),
    ).toBe(true);
  });

  it("rejects a window that is mostly off-screen", () => {
    expect(
      isWindowBoundsVisible({ x: 1750, y: 950, width: 1000, height: 700 }, [
        PRIMARY_DISPLAY,
      ]),
    ).toBe(false);
  });

  it("counts visible areas across adjacent displays", () => {
    expect(
      isWindowBoundsVisible({ x: 1500, y: 100, width: 1000, height: 700 }, [
        PRIMARY_DISPLAY,
        { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } },
      ]),
    ).toBe(true);
  });
});
