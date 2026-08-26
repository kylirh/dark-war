/**
 * Structural validation for every authored social identity.
 *
 * SOCIAL_DEFS is hand-authored content with no schema enforcement beyond the
 * TypeScript interface, and the interface cannot express "non-empty" or "this
 * string is a real sprite key". These tests cover that gap, so a typo in a
 * portrait key or an actor left without greeting lines fails here rather than
 * showing up as a missing portrait or a silent NPC in game.
 */

import { describe, expect, it } from "vitest";
import { SOCIAL_DEFS } from "./social-defs";
import { SPRITE_COORDS } from "../config/sprites";

const ENTRIES = Object.entries(SOCIAL_DEFS);

describe("social definitions", () => {
  it("authors at least one social identity", () => {
    // Guards the loops below, which would all pass vacuously on an empty table.
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("gives every actor a name and a faction", () => {
    for (const [id, def] of ENTRIES) {
      expect(def.name.trim().length, `${id} has no name`).toBeGreaterThan(0);
      expect(def.faction.trim().length, `${id} has no faction`).toBeGreaterThan(
        0,
      );
    }
  });

  it("gives every actor at least one greeting line", () => {
    for (const [id, def] of ENTRIES) {
      expect(def.greeting.length, `${id} is missing greetings`).toBeGreaterThan(
        0,
      );
      for (const line of def.greeting) {
        expect(
          line.trim().length,
          `${id} has a blank greeting`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("points every portraitKey at a real sprite", () => {
    for (const [id, def] of ENTRIES) {
      if (!def.portraitKey) continue;
      expect(
        SPRITE_COORDS[def.portraitKey],
        `${id} references missing sprite ${def.portraitKey}`,
      ).toBeDefined();
    }
  });

  it("never declares an empty optional array", () => {
    // `firstMeet: []` and `gifts: []` are almost always a half-finished edit:
    // they read as "this actor has an intro" while behaving as if it has none.
    for (const [id, def] of ENTRIES) {
      if (def.firstMeet !== undefined) {
        expect(
          def.firstMeet.length,
          `${id} has empty firstMeet`,
        ).toBeGreaterThan(0);
      }
      if (def.gifts !== undefined) {
        expect(def.gifts.length, `${id} has empty gifts`).toBeGreaterThan(0);
      }
    }
  });

  it("never gifts the same item twice from one actor", () => {
    for (const [id, def] of ENTRIES) {
      if (!def.gifts) continue;
      expect(new Set(def.gifts).size, `${id} lists a duplicate gift`).toBe(
        def.gifts.length,
      );
    }
  });
});
