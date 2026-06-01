import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { Physics } from "../physics";
import { MonsterEntity } from "../../entities/monster-entity";
import { BulletEntity } from "../../entities/bullet-entity";
import { EntityKind, ItemType, MonsterType, CELL_CONFIG } from "../../types";
import { RNG } from "../../utils/rng";
import { stepSimulationTick } from "./tick";

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("befriending a wild dog with a thrown bone", () => {
  it("can turn a wild dog friendly and request a name", () => {
    // Find a seed where the 0.6 befriend roll succeeds, then assert the effects.
    let befriended = false;
    for (let seed = 1; seed <= 20 && !befriended; seed++) {
      RNG.reseed(seed);
      const game = new Game({ mode: "offline" });
      game.reset(1);
      clearMonsters(game);
      const state = game.getState();
      const physics = new Physics();

      const dog = new MonsterEntity(
        state.player.gridX + 4,
        state.player.gridY,
        MonsterType.WILD_DOG,
        1,
      );
      state.entityManager.spawn(dog);

      // A bone flying straight at the dog.
      const bone = new BulletEntity(
        dog.worldX - 40,
        dog.worldY,
        220,
        0,
        2,
        state.player.id,
        2000,
        6,
        0,
      );
      bone.thrownItem = ItemType.BONE;
      state.entityManager.spawn(bone);
      physics.rebuildAll(state);
      for (let i = 0; i < 40; i++) physics.updateBullets(state, 1 / 20);

      if (dog.friendly) {
        befriended = true;
        expect(dog.ownerId).toBe(state.player.id);
        expect(state.pendingDogNaming).toBe(dog.id);
      }
    }
    expect(befriended).toBe(true);
  });
});

describe("a friendly pet fights for its owner", () => {
  beforeEach(() => RNG.reseed(4));

  it("bites a nearby hostile monster", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const dog = new MonsterEntity(
      state.player.gridX + 2,
      state.player.gridY,
      MonsterType.WILD_DOG,
      1,
    );
    dog.friendly = true;
    dog.ownerId = state.player.id;
    dog.name = "Rex";
    state.entityManager.spawn(dog);

    const foe = new MonsterEntity(
      state.player.gridX + 2,
      state.player.gridY + 1,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(foe);
    const foeHpStart = foe.hp;

    for (let i = 0; i < 60; i++) stepSimulationTick(state);

    const foeNow = state.entities.find((e) => e.id === foe.id) as
      | { hp: number }
      | undefined;
    // The foe was bitten (damaged or already finished off).
    expect(foeNow === undefined || foeNow.hp < foeHpStart).toBe(true);
  });
});
