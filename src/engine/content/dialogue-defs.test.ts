/** Structural validation for all authored dialogue graphs. */

import { describe, expect, it } from "vitest";
import { DIALOGUE_DEFS, DIALOGUE_FREE_TEXT_MAX_LENGTH } from "./dialogue-defs";
import { SOCIAL_DEFS } from "./social-defs";

describe("dialogue definitions", () => {
  it("exports a valid free text max length", () => {
    expect(typeof DIALOGUE_FREE_TEXT_MAX_LENGTH).toBe("number");
    expect(DIALOGUE_FREE_TEXT_MAX_LENGTH).toBeGreaterThan(0);
    expect(Number.isInteger(DIALOGUE_FREE_TEXT_MAX_LENGTH)).toBe(true);
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

  it("has no orphaned dialogues", () => {
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
        expect(node.text.trim().length, `${dialogueId}.${nodeId} has empty text`).toBeGreaterThan(0);

        const choiceIds = node.choices.map((choice) => {
          expect(choice.label.trim().length, `${dialogueId}.${nodeId} choice '${choice.id}' has empty label`).toBeGreaterThan(0);
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
          expect(node.freeTextPrompt?.trim().length, `${dialogueId}.${nodeId} has empty or missing freeTextPrompt`).toBeGreaterThan(0);
          expect(node.freeTextNext?.trim().length, `${dialogueId}.${nodeId} has empty or missing freeTextNext`).toBeGreaterThan(0);
        }
      }

      expect(
        [...Object.keys(dialogue.nodes)].sort(),
        `${dialogueId} has unreachable authored nodes`,
      ).toEqual([...reachable].sort());
    }
  });
});
