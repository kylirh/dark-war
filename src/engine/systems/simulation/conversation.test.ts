import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { createWorkshopBuilder } from "../../core/actor-factory";
import {
  startConversation,
  applyDialogueChoice,
  leaveConversation,
  buildConversationView,
  getSocialFacts,
  CONVERSATION_PAUSE,
} from "./conversation";

function setup() {
  const game = new Game({ mode: "offline" });
  game.reset(1);
  const state = game.getState();
  const builder = createWorkshopBuilder(
    state.player.gridX + 1,
    state.player.gridY,
  );
  state.entityManager.spawn(builder);
  return { game, state, builder };
}

describe("conversation", () => {
  it("opens a branching conversation and pauses offline", () => {
    const { state, builder } = setup();
    expect(startConversation(state, state.player, builder)).toBe(true);
    expect(state.sim.pauseReasons.has(CONVERSATION_PAUSE)).toBe(true);

    const view = buildConversationView(state, state.player.id)!;
    expect(view.speakerName).toBe("Marda");
    expect(view.portraitKey).toBe("workshop-builder");
    expect(view.choices.map((c) => c.id)).toContain("gear");
    expect(view.revision).toBe(1);
  });

  it("gifts gear exactly once and hides the choice afterward", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "gear", 1);

    expect(state.player.hasMatterManipulator).toBe(true);
    expect(state.player.hasCTDM).toBe(true); // offline
    const facts = getSocialFacts(state, state.player.id, builder.id);
    expect(facts.flags?.receivedGear).toBe(true);

    // Advance back to the greeting; the gear choice is now gone.
    applyDialogueChoice(state, state.player, "thanks", 2);
    const view = buildConversationView(state, state.player.id)!;
    expect(view.choices.map((c) => c.id)).not.toContain("gear");
  });

  it("lets a choice change the speaker's behavior (follow)", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "help", 1); // → askFollow (rev 2)
    applyDialogueChoice(state, state.player, "follow", 2); // → nowFollowing

    expect(builder.friendly).toBe(true);
    expect(builder.ownerId).toBe(state.player.id);
    expect(builder.peaceful).toBe(false);
  });

  it("accepts typed free text and remembers it", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "name", 1); // → askName (rev 2)
    const askName = buildConversationView(state, state.player.id)!;
    expect(askName.allowFreeText).toBe(true);

    applyDialogueChoice(state, state.player, "__freeText", 2, "Ripley");
    const ack = buildConversationView(state, state.player.id)!;
    expect(ack.text).toContain("Ripley"); // {name} resolved
  });

  it("rejects a stale-revision choice (no double-apply)", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "gear", 1); // now revision 2
    // Replaying the same command must not grant gear again / advance.
    const before = buildConversationView(state, state.player.id)!.revision;
    applyDialogueChoice(state, state.player, "gear", 1); // stale revision 1
    const after = buildConversationView(state, state.player.id)!.revision;
    expect(after).toBe(before);
  });

  it("clears the offline pause on leave", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    const rev = buildConversationView(state, state.player.id)!.revision;
    leaveConversation(state, state.player, rev);
    expect(state.conversations.has(state.player.id)).toBe(false);
    expect(state.sim.pauseReasons.has(CONVERSATION_PAUSE)).toBe(false);
  });

  it("persists social facts across save/load", () => {
    const { game, state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "gear", 1);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const facts = getSocialFacts(
      restored.getState(),
      game.getState().player.id,
      builder.id,
    );
    expect(facts.flags?.receivedGear).toBe(true);
  });

  it("does not add a shared pause online", () => {
    const online = new Game({ mode: "online" });
    online.reset(1);
    const state = online.getState();
    const marda = createWorkshopBuilder(
      state.player.gridX + 1,
      state.player.gridY,
    );
    state.entityManager.spawn(marda);
    startConversation(state, state.player, marda);
    expect(state.sim.pauseReasons.has(CONVERSATION_PAUSE)).toBe(false);
  });
});
