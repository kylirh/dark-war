/**
 * Creates and sanitizes ephemeral world callouts without coupling simulation
 * code to their Pixi presentation.
 */

import {
  GameState,
  WorldCallout,
  WorldCalloutPriority,
  WorldReactionId,
  WorldTextCallout,
} from "../types";

export const MAX_WORLD_CALLOUT_CODEPOINTS = 96;
export const MAX_PENDING_WORLD_CALLOUTS = 32;

export interface EmitWorldTextCalloutOptions {
  kind: "speech" | "thought";
  text: string;
  speakerId?: string;
  worldX?: number;
  worldY?: number;
  priority?: WorldCalloutPriority;
  audiencePlayerIds?: string[];
}

export interface EmitWorldReactionOptions {
  reactionId: WorldReactionId;
  speakerId?: string;
  worldX?: number;
  worldY?: number;
  priority?: WorldCalloutPriority;
  audiencePlayerIds?: string[];
}

/** Normalizes player/authored text and enforces a Unicode code-point limit. */
export function sanitizeWorldCalloutText(text: string): string {
  const normalized = text
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(normalized).slice(0, MAX_WORLD_CALLOUT_CODEPOINTS).join("");
}

/** Queues a short speech or thought bubble and returns the accepted callout. */
export function emitWorldTextCallout(
  state: GameState,
  options: EmitWorldTextCalloutOptions,
): WorldTextCallout | undefined {
  const text = sanitizeWorldCalloutText(options.text);
  if (text.length === 0) return undefined;

  const anchor = resolveAnchor(state, options);
  const callout: WorldTextCallout = {
    id: crypto.randomUUID(),
    kind: options.kind,
    text,
    speakerId: options.speakerId,
    worldX: anchor.worldX,
    worldY: anchor.worldY,
    priority: options.priority ?? "normal",
    audiencePlayerIds: options.audiencePlayerIds
      ? [...options.audiencePlayerIds]
      : undefined,
  };
  queueCallout(state, callout);
  return callout;
}

/** Queues a semantic reaction whose artwork and lettering are client-owned. */
export function emitWorldReaction(
  state: GameState,
  options: EmitWorldReactionOptions,
): WorldCallout {
  const anchor = resolveAnchor(state, options);
  const callout: WorldCallout = {
    id: crypto.randomUUID(),
    kind: "reaction",
    reactionId: options.reactionId,
    speakerId: options.speakerId,
    worldX: anchor.worldX,
    worldY: anchor.worldY,
    priority: options.priority ?? "urgent",
    audiencePlayerIds: options.audiencePlayerIds
      ? [...options.audiencePlayerIds]
      : undefined,
  };
  queueCallout(state, callout);
  return callout;
}

function resolveAnchor(
  state: GameState,
  options: { speakerId?: string; worldX?: number; worldY?: number },
): { worldX: number; worldY: number } {
  const speaker = options.speakerId
    ? state.entityManager.getById(options.speakerId)
    : undefined;
  return {
    worldX: speaker?.worldX ?? options.worldX ?? 0,
    worldY: speaker?.worldY ?? options.worldY ?? 0,
  };
}

function queueCallout(state: GameState, callout: WorldCallout): void {
  state.pendingCallouts.push(callout);
  if (state.pendingCallouts.length > MAX_PENDING_WORLD_CALLOUTS) {
    state.pendingCallouts.splice(
      0,
      state.pendingCallouts.length - MAX_PENDING_WORLD_CALLOUTS,
    );
  }
}
