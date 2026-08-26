import { describe, expect, it } from "vitest";
import { SOCIAL_DEFS } from "./social-defs";
import { SPRITE_COORDS } from "../config/sprites";

describe("social definitions", () => {
  it("provides non-empty greeting arrays for all social defs", () => {
    for (const [id, def] of Object.entries(SOCIAL_DEFS)) {
      expect(def.greeting.length, `${id} is missing greetings`).toBeGreaterThan(0);
    }
  });

  it("provides valid portraitKeys that exist in SPRITE_COORDS", () => {
    for (const [id, def] of Object.entries(SOCIAL_DEFS)) {
      if (def.portraitKey) {
        expect(
          SPRITE_COORDS[def.portraitKey],
          `${id} references missing sprite ${def.portraitKey}`
        ).toBeDefined();
      }
    }
  });

  it("does not have empty arrays for firstMeet or gifts", () => {
    for (const [id, def] of Object.entries(SOCIAL_DEFS)) {
      if (def.firstMeet !== undefined) {
        expect(def.firstMeet.length, `${id} has empty firstMeet`).toBeGreaterThan(0);
      }
      if (def.gifts !== undefined) {
        expect(def.gifts.length, `${id} has empty gifts`).toBeGreaterThan(0);
      }
    }
  });
});
