import { describe, expect, it } from "vitest";
import {
  computeWorldMapWindow,
  fitWorldMapCanvas,
  worldMapTileAtCanvasPoint,
  worldMapViewportRects,
  wrappedIntervals,
} from "./world-map";

describe("discovered-world map geometry", () => {
  it("fits an outside-world overview without vertical letterboxing", () => {
    expect(fitWorldMapCanvas(240, 135, 128, 72)).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 135,
      scale: 1.875,
    });
  });

  it("uses the full current world when it fits the overview", () => {
    expect(computeWorldMapWindow(128, 72, true, 4, 5)).toEqual({
      left: 0,
      top: 0,
      width: 128,
      height: 72,
      wraps: true,
    });
  });

  it("limits large bounded worlds to a camera-centered chunk", () => {
    expect(computeWorldMapWindow(400, 240, false, 200, 100)).toEqual({
      left: 120,
      top: 40,
      width: 160,
      height: 120,
      wraps: false,
    });
    expect(computeWorldMapWindow(400, 240, false, 10, 10).left).toBe(0);
    expect(computeWorldMapWindow(400, 240, false, 10, 10).top).toBe(0);
  });

  it("splits viewport outlines at a toroidal seam", () => {
    const rects = worldMapViewportRects(
      { left: 0, top: 0, width: 128, height: 72, wraps: true },
      { x: 124 * 32, y: 10 * 32 },
      { viewW: 8 * 32, viewH: 6 * 32 },
      128,
      72,
    );

    expect(rects).toEqual([
      { x: 124, y: 10, width: 4, height: 6 },
      { x: 0, y: 10, width: 4, height: 6 },
    ]);
  });

  it("handles negative toroidal windows without losing their seam", () => {
    expect(wrappedIntervals(-3, 5, 128)).toEqual([
      { start: 125, length: 3 },
      { start: 0, length: 2 },
    ]);
  });

  it("converts a pointer in a chunk to its unwrapped tile", () => {
    const window = {
      left: -20,
      top: 8,
      width: 80,
      height: 40,
      wraps: true,
    };
    expect(worldMapTileAtCanvasPoint(120, 90, 240, 180, window)).toEqual({
      x: 20,
      y: 28,
    });
  });
});
