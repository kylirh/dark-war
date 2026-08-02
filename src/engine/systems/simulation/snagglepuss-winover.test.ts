import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { CommandType, ItemType, MonsterType } from "../../types";
import { MonsterEntity } from "../../entities/monster-entity";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { canTalkTo } from "./social";
import { isWonOver } from "../../core/relationship-graph";
import {
  applyDialogueChoice,
  buildConversationView,
  startConversation,
} from "./conversation";

/** Feed the selected cookie (heals + warms a nearby snagglepuss). */
function feedCookie(game: Game) {
  const state = game.getState();
  state.player.selectedBarSlot = 0;
  state.player.inventorySlots[0] = { type: ItemType.COOKIE };
  state.player.itemCounts[ItemType.COOKIE] = 5;
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.USE_ITEM,
    data: { type: "USE_ITEM", dx: 1, dy: 0 },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

describe("winning over a snagglepuss", () => {
  it("can talk while hostile, is won over by cookies, and joins by choice", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const snag = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      MonsterType.SNAGGLEPUSS,
      1,
    );
    state.entityManager.spawn(snag);

    expect(canTalkTo(snag)).toBe(true);
    expect(startConversation(state, state.player, snag)).toBe(true);
    expect(buildConversationView(state, state.player.id)?.speakerName).toBe(
      "Snagglepuss",
    );
    applyDialogueChoice(state, state.player, "leave", 1);

    // One cookie warms it but does not yet win it over.
    feedCookie(game);
    expect(snag.friendly).not.toBe(true);
    expect(isWonOver(state.relationships.get(state.player.id, snag.id))).toBe(
      false,
    );

    // A second cookie crosses the trust threshold, but recruitment is explicit.
    feedCookie(game);
    expect(canTalkTo(snag)).toBe(true);
    expect(snag.social?.defId).toBe("wildlife.snagglepuss");
    expect(isWonOver(state.relationships.get(state.player.id, snag.id))).toBe(
      true,
    );
    expect(snag.ownerId).toBeUndefined();

    startConversation(state, state.player, snag);
    expect(
      buildConversationView(state, state.player.id)?.choices,
    ).toContainEqual(expect.objectContaining({ id: "join" }));
    applyDialogueChoice(state, state.player, "join", 1);
    expect(snag.friendly).toBe(true);
    expect(snag.ownerId).toBe(state.player.id);
  });

  it("persists a won-over snagglepuss and the relationship across save/load", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const snag = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      MonsterType.SNAGGLEPUSS,
      1,
    );
    state.entityManager.spawn(snag);
    feedCookie(game);
    feedCookie(game);
    startConversation(state, state.player, snag);
    applyDialogueChoice(state, state.player, "join", 1);
    expect(snag.friendly).toBe(true);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const restoredSnag = restored
      .getState()
      .entities.find((e) => e.id === snag.id);
    expect(restoredSnag).toBeTruthy();
    expect(canTalkTo(restoredSnag!)).toBe(true);
    expect(
      isWonOver(
        restored
          .getState()
          .relationships.get(game.getState().player.id, snag.id),
      ),
    ).toBe(true);
  });
});
