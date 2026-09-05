import { describe, expect, it } from "vitest";
import { screenRectsOverlap } from "./hud-layout";

describe("HUD layout geometry", () => {
  it("detects overlap with optional clearance", () => {
    const player = { left: 20, top: 20, right: 52, bottom: 52 };
    const overlay = { left: 52, top: 24, right: 120, bottom: 80 };

    expect(screenRectsOverlap(player, overlay)).toBe(false);
    expect(screenRectsOverlap(player, overlay, 1)).toBe(true);
  });
});
