/**
 * Verifies that combat deaths leave only authored loot and that Mutants do not
 * have a dead-body scavenging behavior.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { SoundEffect } from "../../content/sound-effects";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import {
  EntityKind,
  EventType,
  ItemType,
  MonsterType,
  TileType,
} from "../../types";
import { setPositionFromGrid } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import { updateMonsterSteering } from "./ai";
import { processEventQueue } from "./events";
import { pushEvent } from "./sim-helpers";

function setupGame(): Game {
  const game = new Game({ mode: "offline" });
  game.reset(3);
  const state = game.getState();
  state.entityManager.destroyWhere(
    (entity) =>
      entity.kind === EntityKind.MONSTER || entity.kind === EntityKind.ITEM,
  );
  setPositionFromGrid(state.player, 10, 10);
  for (let x = 8; x <= 40; x++) {
    state.tiles.setTile(x, 10, TileType.FLOOR);
  }
  return game;
}

describe("combat cleanup", () => {
  beforeEach(() => RNG.reseed(31));

  it("does not make Mutants pursue or consume loose organic-looking items", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(14, 10, MonsterType.MUTANT, 3);
    const bone = new ItemEntity(16, 10, ItemType.BONE);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(bone);

    updateMonsterSteering(state);

    expect(state.entities.some((entity) => entity.id === bone.id)).toBe(true);
    expect(
      state.pendingSounds.some(
        (sound) => sound.effect === SoundEffect.MUTANT_EAT,
      ),
    ).toBe(false);
  });

  it.each([
    [MonsterType.CYBERCOP, 1],
    [MonsterType.UTILITY_BOT, 1],
    [MonsterType.DREADNAUGHT, 3],
  ] as const)(
    "leaves %s collectible scrap when defeated",
    (monsterType, amount) => {
      const game = setupGame();
      const state = game.getState();
      const robot = new MonsterEntity(12, 10, monsterType, 3);
      robot.hp = 0;
      state.entityManager.spawn(robot);

      pushEvent(state, {
        type: EventType.DEATH,
        data: { type: "DEATH", entityId: robot.id },
      });
      processEventQueue(state);

      const scrap = state.entities.find(
        (entity) =>
          entity.kind === EntityKind.ITEM &&
          (entity as ItemEntity).type === ItemType.METAL_SCRAPS,
      ) as ItemEntity | undefined;
      expect(scrap).toBeDefined();
      expect(scrap?.amount).toBe(amount);
    },
  );
});
