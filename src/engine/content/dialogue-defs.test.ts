/**
 * Structural validation for all authored dialogue graphs.
 *
 * DIALOGUE_DEFS is hand-authored data compiled to a runtime graph, and the
 * TypeScript interface cannot express the invariants that matter: that links
 * resolve, that choice ids are unique, that no node is stranded, and that every
 * graph is actually reachable from a social def. These tests cover that gap.
 */

import { describe, expect, it } from "vitest";
import { DIALOGUE_DEFS, DIALOGUE_FREE_TEXT_MAX_LENGTH } from "./dialogue-defs";
import { SOCIAL_DEFS } from "./social-defs";

describe("dialogue definitions", () => {
  it("authors at least one dialogue graph", () => {
    // Guards the loops below, which would all pass vacuously on an empty table.
    expect(Object.keys(DIALOGUE_DEFS).length).toBeGreaterThan(0);
  });

  it("caps free text at a length usable as an input maxLength", () => {
    // The sim truncates with .slice(0, MAX) and the dialogue panel assigns the
    // same constant to input.maxLength, which silently misbehaves for a
    // fractional or non-positive value.
    expect(Number.isInteger(DIALOGUE_FREE_TEXT_MAX_LENGTH)).toBe(true);
    expect(DIALOGUE_FREE_TEXT_MAX_LENGTH).toBeGreaterThan(0);
  });

  it("keeps every social dialogue reference valid", () => {
    for (const [socialId, socialDef] of Object.entries(SOCIAL_DEFS)) {
      if (!socialDef.dialogueId) continue;
      expect(
        DIALOGUE_DEFS[socialDef.dialogueId],
        `${socialId} references missing dialogue ${socialDef.dialogueId}`,
      ).toBeDefined();
    }
  });

  it("keeps every authored dialogue reachable from a social def", () => {
    // dialogueFor() in conversation.ts resolves a graph only via
    // SOCIAL_DEFS[defId].dialogueId, so an unreferenced graph is dead content
    // that no actor can ever open.
    const referencedDialogueIds = new Set<string>();
    for (const socialDef of Object.values(SOCIAL_DEFS)) {
      if (socialDef.dialogueId) {
        referencedDialogueIds.add(socialDef.dialogueId);
      }
    }

    for (const dialogueId of Object.keys(DIALOGUE_DEFS)) {
      expect(
        referencedDialogueIds.has(dialogueId),
        `Dialogue ${dialogueId} is not referenced by any social definition`,
      ).toBe(true);
    }
  });

  it("has valid, reachable node links and unique response ids", () => {
    for (const [dialogueId, dialogue] of Object.entries(DIALOGUE_DEFS)) {
      expect(
        dialogue.nodes[dialogue.entry],
        `${dialogueId} has a missing entry node`,
      ).toBeDefined();

      const reachable = new Set<string>();
      const pending = [dialogue.entry];
      while (pending.length > 0) {
        const nodeId = pending.pop()!;
        if (reachable.has(nodeId)) continue;
        reachable.add(nodeId);
        const node = dialogue.nodes[nodeId];
        expect(node, `${dialogueId}.${nodeId} is missing`).toBeDefined();
        if (!node) continue;
        expect(
          node.text.trim().length,
          `${dialogueId}.${nodeId} has empty text`,
        ).toBeGreaterThan(0);

        const choiceIds = node.choices.map((choice) => {
          expect(
            choice.label.trim().length,
            `${dialogueId}.${nodeId} choice '${choice.id}' has empty label`,
          ).toBeGreaterThan(0);
          return choice.id;
        });
        expect(
          new Set(choiceIds).size,
          `${dialogueId}.${nodeId} has duplicate response ids`,
        ).toBe(choiceIds.length);

        const destinations = [
          node.next,
          node.freeTextNext,
          ...node.choices.map((choice) => choice.next),
        ].filter((destination): destination is string => !!destination);
        for (const destination of destinations) {
          expect(
            dialogue.nodes[destination],
            `${dialogueId}.${nodeId} links to missing node ${destination}`,
          ).toBeDefined();
          pending.push(destination);
        }

        if (!node.allowFreeText) {
          expect(node.freeTextPrompt).toBeUndefined();
          expect(node.freeTextEffects).toBeUndefined();
          expect(node.freeTextNext).toBeUndefined();
        } else {
          // The panel falls back to a generic placeholder, but a free-text node
          // shipping without its own prompt is an authoring oversight.
          expect(
            node.freeTextPrompt?.trim().length,
            `${dialogueId}.${nodeId} allows free text with no freeTextPrompt`,
          ).toBeGreaterThan(0);
          // freeTextNext is deliberately optional: omitting it ends the
          // conversation after the answer (advanceOrEnd handles undefined).
          // When present it is validated as a link above.
        }
      }

      expect(
        [...Object.keys(dialogue.nodes)].sort(),
        `${dialogueId} has unreachable authored nodes`,
      ).toEqual([...reachable].sort());
    }
  });
});
