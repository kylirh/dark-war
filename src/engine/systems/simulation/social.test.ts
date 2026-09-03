import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import {
  createWorkshopBuilder,
  WORKSHOP_BUILDER_ID,
} from "../../core/actor-factory";
import { createOutsideLevel } from "../../core/outside-level";
import { canTalkTo, findTalkTarget, resolveTalk } from "./social";
import { getSocialFacts } from "./conversation";
import { processEventQueue } from "./events";
import { EntityKind, EventType, ItemType, MonsterType } from "../../types";
import { PlayerEntity } from "../../entities/player-entity";
import { Entity } from "../../types";

describe("social actors", () => {
  describe("canTalkTo", () => {
    it("returns true when entity has social and interactable with talk affordance", () => {
      const entity = {
        social: { defId: "some-def" },
        interactable: { affordances: ["talk"] },
      } as Entity;
      expect(canTalkTo(entity)).toBe(true);
    });

    it("returns false when entity lacks social component", () => {
      const entity = {
        interactable: { affordances: ["talk"] },
      } as Entity;
      expect(canTalkTo(entity)).toBe(false);
    });

    it("returns false when entity lacks interactable component", () => {
      const entity = {
        social: { defId: "some-def" },
      } as Entity;
      expect(canTalkTo(entity)).toBe(false);
    });

    it("returns false when entity interactable affordances lack talk", () => {
      const entity = {
        social: { defId: "some-def" },
        interactable: { affordances: ["inspect"] as any[] },
      } as Entity;
      expect(canTalkTo(entity)).toBe(false);
    });
  });

  it("builds a workshop builder wearing social/interactable/peaceful", () => {
    const builder = createWorkshopBuilder(5, 5);
    expect(builder.id).toBe(WORKSHOP_BUILDER_ID);
    expect(builder.peaceful).toBe(true);
    expect(canTalkTo(builder)).toBe(true);
    expect(builder.social?.defId).toBe("settler.workshop-builder");
  });

  it("spawns the start builder and a park builder", () => {
    const level = createOutsideLevel();
    const builders = level.entities.filter(
      (e) =>
        e.kind === EntityKind.MONSTER &&
        (e as { type: MonsterType }).type === MonsterType.WORKSHOP_BUILDER,
    );
    expect(builders).toHaveLength(2);
    // One greets the player just east of the start so they are equipped at once.
    const start = builders.find((b) => b.gridX === 15 && b.gridY === 58);
    expect(start).toBeTruthy();
    expect(start!.social?.defId).toBe("settler.workshop-builder");
    // The other tends the park workshop (south-east), from the prefab marker.
    const park = builders.find(
      (b) => b.social?.defId === "settler.park-builder",
    );
    expect(park).toBeTruthy();
    expect(park!.gridX).toBeGreaterThan(40);
    expect(park!.gridY).toBeGreaterThan(40);
  });

  it("no longer scatters the CTDM or Matter Manipulator in the world", () => {
    const level = createOutsideLevel();
    const loose = level.entities.filter(
      (e) =>
        e.kind === EntityKind.ITEM &&
        ((e as { type: ItemType }).type === ItemType.CTDM ||
          (e as { type: ItemType }).type === ItemType.MATTER_MANIPULATOR),
    );
    expect(loose).toHaveLength(0);
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

    resolveTalk(state, state.player, builder);
    const first = state.eventQueue.find((e) => e.type === EventType.NPC_TALK);
    expect(first).toBeTruthy();
    const firstMessage = (first!.data as { message: string }).message;
    expect(firstMessage).toContain("Marda");
    expect(firstMessage).toContain("You made it"); // first-meet line
    expect(getSocialFacts(state, state.player.id, builder.id).flags?.met).toBe(
      true,
    );
    // The builder handed over the starting gear on first meet.
    expect(state.player.hasCTDM).toBe(true);
    expect(state.player.hasMatterManipulator).toBe(true);

    // A second conversation no longer replays the first-meet line.
    state.eventQueue.length = 0;
    resolveTalk(state, state.player, builder);
    const second = state.eventQueue.find((e) => e.type === EventType.NPC_TALK);
    const secondMessage = (second!.data as { message: string }).message;
    expect(secondMessage).not.toContain("You made it");
  });

  it("gifts both devices offline, but skips the inert CTDM online", () => {
    const online = new Game({ mode: "online" }).getState();
    const builder = createWorkshopBuilder(
      online.player.gridX + 1,
      online.player.gridY,
    );
    online.entityManager.spawn(builder);
    resolveTalk(online, online.player, builder);
    expect(online.player.hasMatterManipulator).toBe(true);
    expect(online.player.hasCTDM).toBe(false);
  });

  it("keeps first-meet memory private to each multiplayer player", () => {
    const state = new Game({ mode: "online" }).getState();
    const builder = createWorkshopBuilder(
      state.player.gridX + 1,
      state.player.gridY,
    );
    const secondPlayer = new PlayerEntity(
      state.player.gridX,
      state.player.gridY,
    );
    secondPlayer.id = "second-player";
    state.entityManager.spawn(builder);
    state.entityManager.spawn(secondPlayer);
    state.players.push(secondPlayer);

    resolveTalk(state, state.player, builder);
    state.eventQueue.length = 0;
    resolveTalk(state, secondPlayer, builder);
    const second = state.eventQueue.find(
      (event) => event.type === EventType.NPC_TALK,
    );
    expect((second!.data as { message: string }).message).toContain(
      "You made it",
    );
    expect(getSocialFacts(state, state.player.id, builder.id).flags?.met).toBe(
      true,
    );
    expect(getSocialFacts(state, secondPlayer.id, builder.id).flags?.met).toBe(
      true,
    );
  });

  it("a one-shot line never adds an unclearable pause (would soft-freeze)", () => {
    // Non-modal ambient talk must not add the pause reason reserved for full
    // authored conversations in either mode.
    for (const mode of ["offline", "online"] as const) {
      const state = new Game({ mode }).getState();
      const builder = createWorkshopBuilder(
        state.player.gridX + 1,
        state.player.gridY,
      );
      state.entityManager.spawn(builder);
      resolveTalk(state, state.player, builder);
      processEventQueue(state);
      expect(state.sim.pauseReasons.has("npc_talk")).toBe(false);
      expect(state.sim.targetTimeScale).not.toBeLessThan(0.5);
    }
  });
});
