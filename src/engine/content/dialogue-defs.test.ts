/** Structural validation for all authored dialogue graphs. */

import { describe, expect, it } from "vitest";
import { DIALOGUE_DEFS } from "./dialogue-defs";
import { SOCIAL_DEFS } from "./social-defs";

describe("dialogue definitions", () => {
  it("keeps every social dialogue reference valid", () => {
    for (const [socialId, socialDef] of Object.entries(SOCIAL_DEFS)) {
      if (!socialDef.dialogueId) continue;
      expect(
        DIALOGUE_DEFS[socialDef.dialogueId],
        `${socialId} references missing dialogue ${socialDef.dialogueId}`,
      ).toBeDefined();
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

        const choiceIds = node.choices.map((choice) => choice.id);
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
        }
      }

      expect(
        [...Object.keys(dialogue.nodes)].sort(),
        `${dialogueId} has unreachable authored nodes`,
      ).toEqual([...reachable].sort());
    }
  });
});
