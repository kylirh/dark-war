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
  updateConversationSessions,
} from "./conversation";
import { resolveCommand } from "./commands";
import { CommandType } from "../../types";

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

    const acknowledgement = buildConversationView(state, state.player.id)!;
    expect(acknowledgement.choices).toEqual([]);
    expect(acknowledgement.canContinue).toBe(true);

    // Response-free NPC lines advance through the validated Next action.
    applyDialogueChoice(state, state.player, "__continue", 2);
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
    expect(ack.canContinue).toBe(true);
  });

  it("rejects blank free text and bounds remembered input", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "name", 1);

    applyDialogueChoice(state, state.player, "__freeText", 2, "   ");
    expect(buildConversationView(state, state.player.id)!.revision).toBe(2);

    applyDialogueChoice(state, state.player, "__freeText", 2, "x".repeat(80));
    expect(
      getSocialFacts(state, state.player.id, builder.id).notes?.name,
    ).toHaveLength(32);
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

  it("stops movement and blocks world commands while talking", () => {
    const { state, builder } = setup();
    state.player.velocityX = 225;
    startConversation(state, state.player, builder);
    expect(state.player.velocityX).toBe(0);
    const nextActTick = state.player.nextActTick;

    resolveCommand(state, {
      id: "blocked-wait",
      tick: state.sim.nowTick,
      actorId: state.player.id,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "PLAYER",
    });
    expect(state.player.nextActTick).toBe(nextActTick);
  });

  it("closes and resumes if the speaker disappears", () => {
    const { state, builder } = setup();
    startConversation(state, state.player, builder);
    state.entityManager.destroy(builder.id);
    updateConversationSessions(state);
    expect(state.conversations.has(state.player.id)).toBe(false);
    expect(state.sim.pauseReasons.has(CONVERSATION_PAUSE)).toBe(false);
  });

  it("resets active sessions and dialogue memory for a new game", () => {
    const { game, state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "name", 1);
    applyDialogueChoice(state, state.player, "__freeText", 2, "Ripley");

    game.reset(0);
    expect(game.getConversationView()).toBeUndefined();
    expect(game.getState().conversations.size).toBe(0);
    expect(game.getState().playerSocialFacts.size).toBe(0);
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

  it("serializes social facts without aliasing live dialogue memory", () => {
    const { game, state, builder } = setup();
    startConversation(state, state.player, builder);
    applyDialogueChoice(state, state.player, "name", 1);
    applyDialogueChoice(state, state.player, "__freeText", 2, "Ripley");

    const serialized = game.serialize();
    getSocialFacts(state, state.player.id, builder.id).notes!.name = "Changed";
    expect(serialized.socialFacts?.[builder.id].notes?.name).toBe("Ripley");
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

  it("clears a cached online dialogue view when the game resets", () => {
    const server = new Game({ mode: "online" });
    server.reset(1);
    const serverState = server.getState();
    const marda = createWorkshopBuilder(
      serverState.player.gridX + 1,
      serverState.player.gridY,
    );
    serverState.entityManager.spawn(marda);
    startConversation(serverState, serverState.player, marda);

    const client = new Game({ mode: "online" });
    client.deserialize(server.serializeForPlayer(serverState.player.id));
    expect(client.getConversationView()).toBeDefined();

    client.reset(0);
    expect(client.getConversationView()).toBeUndefined();
  });
});
