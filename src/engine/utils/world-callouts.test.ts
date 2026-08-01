/** Tests for world-callout sanitation, anchoring, and bounded emission. */

import { describe, expect, it } from "vitest";
import { GameState, WorldTextCallout } from "../types";
import {
  MAX_PENDING_WORLD_CALLOUTS,
  MAX_WORLD_CALLOUT_CODEPOINTS,
  emitWorldReaction,
  emitWorldTextCallout,
  sanitizeWorldCalloutText,
} from "./world-callouts";

function stateForCallouts(): GameState {
  return {
    entities: [{ id: "speaker", worldX: 42, worldY: 84 }],
    pendingCallouts: [],
  } as unknown as GameState;
}

describe("world callouts", () => {
  it("normalizes whitespace, controls, and Unicode code-point length", () => {
    const long = `  hello\n\u0000   ${"🪻".repeat(120)}  `;
    const sanitized = sanitizeWorldCalloutText(long);

    expect(sanitized.startsWith("hello ")).toBe(true);
    expect(sanitized).not.toMatch(/[\u0000-\u001f]/u);
    expect(Array.from(sanitized)).toHaveLength(MAX_WORLD_CALLOUT_CODEPOINTS);
  });

  it("anchors text to a live speaker and ignores empty input", () => {
    const state = stateForCallouts();
    const callout = emitWorldTextCallout(state, {
      kind: "speech",
      text: "  Hello there!  ",
      speakerId: "speaker",
      worldX: 1,
      worldY: 2,
    });

    expect(callout).toMatchObject({
      kind: "speech",
      text: "Hello there!",
      speakerId: "speaker",
      worldX: 42,
      worldY: 84,
    });
    expect(
      emitWorldTextCallout(state, { kind: "thought", text: " \n " }),
    ).toBeUndefined();
  });

  it("copies audiences, supports semantic reactions, and bounds its queue", () => {
    const state = stateForCallouts();
    const audience = ["player-a"];
    const reaction = emitWorldReaction(state, {
      reactionId: "gasp",
      speakerId: "speaker",
      audiencePlayerIds: audience,
    });
    audience.push("player-b");

    expect(reaction).toMatchObject({
      kind: "reaction",
      reactionId: "gasp",
      audiencePlayerIds: ["player-a"],
    });

    for (let index = 0; index < MAX_PENDING_WORLD_CALLOUTS + 5; index++) {
      emitWorldTextCallout(state, { kind: "speech", text: String(index) });
    }
    expect(state.pendingCallouts).toHaveLength(MAX_PENDING_WORLD_CALLOUTS);
    expect((state.pendingCallouts.at(-1) as WorldTextCallout).text).toBe(
      String(MAX_PENDING_WORLD_CALLOUTS + 4),
    );
  });
});
