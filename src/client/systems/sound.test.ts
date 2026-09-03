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

  it("returns base volume if worldX is undefined", () => {
    expect(
      volumeForSoundCue(
        0.8,
        { effect: "test", worldY: 0 },
        100,
        100,
        "dungeon",
        1000,
        1000,
      ),
    ).toBe(0.8);
  });

  it("returns base volume if worldY is undefined", () => {
    expect(
      volumeForSoundCue(
        0.8,
        { effect: "test", worldX: 0 },
        100,
        100,
        "dungeon",
        1000,
        1000,
      ),
    ).toBe(0.8);
  });

  it("bounds minimumVolumeScale to 0 if negative", () => {
    expect(
      volumeForSoundCue(
        1.0,
        {
          effect: "test",
          worldX: 100,
          worldY: 0,
          maxDistancePx: 100,
          minimumVolumeScale: -0.5,
        },
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0);
  });

  it("bounds minimumVolumeScale to 1 if > 1", () => {
    expect(
      volumeForSoundCue(
        1.0,
        {
          effect: "test",
          worldX: 100,
          worldY: 0,
          maxDistancePx: 100,
          minimumVolumeScale: 1.5,
        },
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(1.0);
  });

  it("bounds maxDistancePx to 1 if negative or 0", () => {
    expect(
      volumeForSoundCue(
        1.0,
        { effect: "test", worldX: 1, worldY: 0, maxDistancePx: 0 },
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0); // distance is 1, maxDistance is bounded to 1. 1/1 = 1. 1 - 1 = 0
  });

  it("uses default max distance (32 * 18 = 576) if not provided", () => {
    expect(
      volumeForSoundCue(
        1.0,
        { effect: "test", worldX: 288, worldY: 0 }, // 288 is half of 576
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0.5);
  });

  it("caps distanceRatio at 1 (distance > maxDistance returns exactly minimum volume)", () => {
    expect(
      volumeForSoundCue(
        1.0,
        {
          effect: "test",
          worldX: 200,
          worldY: 0,
          maxDistancePx: 100,
          minimumVolumeScale: 0.2,
        },
        0,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0.2);
  });

  it("does not wrap distance in non-outside levels", () => {
    expect(
      volumeForSoundCue(
        1.0,
        { effect: "test", worldX: 990, worldY: 0, maxDistancePx: 100 },
        10,
        0,
        "dungeon",
        1000,
        1000,
      ),
    ).toBeCloseTo(0); // linear distance is 980. ratio is > 1. so volume is 0.
  });
});
