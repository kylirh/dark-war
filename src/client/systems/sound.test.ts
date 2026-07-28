/**
 * Verifies spatial sound attenuation, including the outside world's seam.
 */

import { describe, expect, it } from "vitest";
import { volumeForSoundCue } from "./sound";

describe("volumeForSoundCue", () => {
  it("fades positioned sounds with distance", () => {
    expect(
      volumeForSoundCue(
        0.8,
        { effect: "test", worldX: 50, worldY: 0, maxDistancePx: 100 },
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0.4);
  });

  it("uses shortest-path distance across the outside-world seam", () => {
    expect(
      volumeForSoundCue(
        1,
        { effect: "test", worldX: 990, worldY: 0, maxDistancePx: 100 },
        10,
        0,
        "outside",
        1000,
        1000,
      ),
    ).toBeCloseTo(0.8);
  });

  it("honors a minimum volume floor for long-range ambience", () => {
    expect(
      volumeForSoundCue(
        0.5,
        {
          effect: "test",
          worldX: 1000,
          worldY: 0,
          maxDistancePx: 100,
          minimumVolumeScale: 0.6,
        },
        0,
        0,
        "dungeon",
        2000,
        2000,
      ),
    ).toBeCloseTo(0.3);
  });
});
