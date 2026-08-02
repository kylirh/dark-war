/** Relationship, deception, bargaining, and recruitment tests for Snagglepuss. */

import { describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { PlayerEntity } from "../../entities/player-entity";
import { EntityKind, EventType, ItemType, MonsterType } from "../../types";
import { processEventQueue } from "./events";
import { pushEvent } from "./sim-helpers";
import {
  applyDialogueChoice,
  buildConversationView,
  getSocialFacts,
  startConversation,
} from "./conversation";
import {
  closestHostilePlayerForSnagglepuss,
  recruitSnagglepuss,
} from "./snagglepuss-social";
import { updateMonsterSteering } from "./ai";

function setup() {
  const game = new Game({ mode: "online" });
  game.reset(1);
  const state = game.getState();
  state.entityManager.destroyWhere(
    (entity) =>
      entity.kind === EntityKind.MONSTER &&
      (entity as { type: MonsterType }).type !== MonsterType.WORKSHOP_BUILDER,
  );
  const snagglepuss = new MonsterEntity(
    state.player.gridX + 1,
    state.player.gridY,
    MonsterType.SNAGGLEPUSS,
    1,
  );
  state.entityManager.spawn(snagglepuss);
  return { game, state, snagglepuss };
}

describe("Snagglepuss social behavior", () => {
  it("lies about stolen loot, bargains atomically, and remembers the decision", () => {
    const { state, snagglepuss } = setup();
    const player = state.player;
    player.itemCounts[ItemType.BONE] = 1;
    player.inventorySlots[1] = { type: ItemType.BONE };

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: player.id,
        sourceId: snagglepuss.id,
        amount: 1,
      },
    });
    processEventQueue(state);
    expect(snagglepuss.fleeing).toBe(true);
    expect(snagglepuss.carriedItems).toContainEqual({ type: ItemType.BONE });

    player.itemCounts[ItemType.COOKIE] = 1;
    player.inventorySlots[2] = { type: ItemType.COOKIE };

    expect(startConversation(state, player, snagglepuss)).toBe(true);
    applyDialogueChoice(state, player, "stolen", 1);
    expect(buildConversationView(state, player.id)?.text).toContain(
      "Entirely different",
    );
    applyDialogueChoice(state, player, "tradeCookie", 2);

    expect(player.itemCounts[ItemType.COOKIE]).toBeUndefined();
    expect(player.itemCounts[ItemType.BONE]).toBe(1);
    expect(snagglepuss.carriedItems).toEqual([]);
    expect(snagglepuss.fleeing).toBe(false);
    expect(
      getSocialFacts(state, player.id, snagglepuss.id).flags,
    ).toMatchObject({ caughtLying: true, bargainedForLoot: true });
  });

  it("derives recruitment and betrayal from the relationship edge", () => {
    const { state, snagglepuss } = setup();
    const player = state.player;
    state.relationships.adjust(player.id, snagglepuss.id, { affinity: 70 });
    expect(recruitSnagglepuss(state, snagglepuss, player.id)).toBe(true);
    expect(snagglepuss.ownerId).toBe(player.id);

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: snagglepuss.id,
        sourceId: player.id,
        amount: 1,
      },
    });
    processEventQueue(state);
    expect(snagglepuss.ownerId).toBeUndefined();
    expect(snagglepuss.friendly).toBe(false);
    expect(state.relationships.get(player.id, snagglepuss.id)).toMatchObject({
      affinity: 45,
      fear: 5,
      grievance: 20,
    });
  });

  it("can trust one player while still treating another independently", () => {
    const { state, snagglepuss } = setup();
    const second = new PlayerEntity(state.player.gridX + 2, state.player.gridY);
    second.id = "second-player";
    state.entityManager.spawn(second);
    state.players.push(second);
    state.relationships.adjust(state.player.id, snagglepuss.id, {
      affinity: 70,
    });

    expect(closestHostilePlayerForSnagglepuss(state, snagglepuss)?.id).toBe(
      second.id,
    );
  });

  it("stops moving and acting while either player is talking to it", () => {
    const { state, snagglepuss } = setup();
    snagglepuss.velocityX = 200;
    startConversation(state, state.player, snagglepuss);
    updateMonsterSteering(state);
    expect(snagglepuss.velocityX).toBe(0);
    expect(snagglepuss.velocityY).toBe(0);
  });
});
