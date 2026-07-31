import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import {
  createWorkshopBuilder,
  WORKSHOP_BUILDER_ID,
} from "../../core/actor-factory";
import { createOutsideLevel } from "../../core/outside-level";
import { canTalkTo, findTalkTarget, resolveTalk } from "./social";
import { processEventQueue } from "./events";
import { EntityKind, EventType, MonsterType } from "../../types";

describe("social actors", () => {
  it("builds a workshop builder wearing social/interactable/peaceful", () => {
    const builder = createWorkshopBuilder(5, 5);
    expect(builder.id).toBe(WORKSHOP_BUILDER_ID);
    expect(builder.peaceful).toBe(true);
    expect(canTalkTo(builder)).toBe(true);
    expect(builder.social?.defId).toBe("settler.workshop-builder");
  });

  it("spawns exactly one builder in the outside level, from the marker", () => {
    const level = createOutsideLevel();
    const builders = level.entities.filter(
      (e) =>
        e.kind === EntityKind.MONSTER &&
        (e as { type: MonsterType }).type === MonsterType.WORKSHOP_BUILDER,
    );
    expect(builders).toHaveLength(1);
    // Placed inside the authored workshop garden footprint (south-east park).
    expect(builders[0].gridX).toBeGreaterThan(40);
    expect(builders[0].gridY).toBeGreaterThan(40);
  });

  it("emits NPC_TALK with first-meet then a greeting, once", () => {
    const game = new Game({ mode: "offline" });
    const state = game.getState();
    const builder = createWorkshopBuilder(
      state.player.gridX + 1,
      state.player.gridY,
    );
    state.entityManager.spawn(builder);

    const target = findTalkTarget(
      state,
      state.player,
      builder.gridX,
      builder.gridY,
    );
    expect(target?.id).toBe(builder.id);

    resolveTalk(state, builder);
    const first = state.eventQueue.find((e) => e.type === EventType.NPC_TALK);
    expect(first).toBeTruthy();
    const firstMessage = (first!.data as { message: string }).message;
    expect(firstMessage).toContain("Marda");
    expect(firstMessage).toContain("You made it"); // first-meet line
    expect(builder.social?.flags?.met).toBe(true);

    // A second conversation no longer replays the first-meet line.
    state.eventQueue.length = 0;
    resolveTalk(state, builder);
    const second = state.eventQueue.find((e) => e.type === EventType.NPC_TALK);
    const secondMessage = (second!.data as { message: string }).message;
    expect(secondMessage).not.toContain("You made it");
  });

  it("slows time on NPC talk offline but never online", () => {
    const offline = new Game({ mode: "offline" }).getState();
    const offlineBuilder = createWorkshopBuilder(
      offline.player.gridX + 1,
      offline.player.gridY,
    );
    offline.entityManager.spawn(offlineBuilder);
    resolveTalk(offline, offlineBuilder);
    processEventQueue(offline);
    expect(offline.sim.pauseReasons.has("npc_talk")).toBe(true);

    const online = new Game({ mode: "online" }).getState();
    const onlineBuilder = createWorkshopBuilder(
      online.player.gridX + 1,
      online.player.gridY,
    );
    online.entityManager.spawn(onlineBuilder);
    resolveTalk(online, onlineBuilder);
    processEventQueue(online);
    expect(online.sim.pauseReasons.has("npc_talk")).toBe(false);
  });
});
