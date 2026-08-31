import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { Game } from "../../core/game";
import { Physics } from "../physics";
import { MonsterEntity } from "../../entities/monster-entity";
import { BulletEntity } from "../../entities/bullet-entity";
import {
  EntityKind,
  ItemType,
  MonsterType,
  TileType,
  CELL_CONFIG,
} from "../../types";
import { RNG } from "../../utils/rng";
import { stepSimulationTick } from "./tick";
import { updateMonsterSteering } from "./ai";
import { SoundEffect } from "../../content/sound-effects";

const DOG_VOCALS = new Set<string>([
  SoundEffect.DOG_VOCAL_1,
  SoundEffect.DOG_VOCAL_2,
  SoundEffect.DOG_VOCAL_3,
  SoundEffect.DOG_VOCAL_4,
  SoundEffect.DOG_VOCAL_5,
  SoundEffect.DOG_VOCAL_6,
  SoundEffect.DOG_VOCAL_7,
  SoundEffect.DOG_VOCAL_8,
  SoundEffect.DOG_VOCAL_9,
  SoundEffect.DOG_VOCAL_10,
]);
const DOG_EATING_SOUNDS = new Set<string>([
  SoundEffect.DOG_EAT_1,
  SoundEffect.DOG_EAT_2,
]);
const DOG_WHIMPER_SOUNDS = new Set<string>([
  SoundEffect.DOG_WIMPER_1,
  SoundEffect.DOG_WIMPER_2,
  SoundEffect.DOG_WIMPER_3,
  SoundEffect.DOG_WIMPER_4,
]);

function hasDogVocal(state: ReturnType<Game["getState"]>): boolean {
  return state.pendingSounds.some((sound) => DOG_VOCALS.has(sound.effect));
}

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
        expect(
          state.pendingSounds.some((sound) =>
            DOG_EATING_SOUNDS.has(sound.effect),
          ),
        ).toBe(true);
        expect(
          state.pendingSounds.some((sound) =>
            DOG_WHIMPER_SOUNDS.has(sound.effect),
          ),
        ).toBe(true);
      }
    }
    expect(befriended).toBe(true);
  });
});

describe("a friendly pet fights for its owner", () => {
  beforeEach(() => RNG.reseed(4));
  afterEach(() => vi.restoreAllMocks());

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

    const foeNow = state.entityManager.getById(foe.id) as
      | { hp: number }
      | undefined;
    // The foe was bitten (damaged or already finished off).
    expect(foeNow === undefined || foeNow.hp < foeHpStart).toBe(true);
  });

  it("vocalizes when identifying and switching nearby hostile targets", () => {
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
    state.entityManager.spawn(dog);
    const firstTarget = new MonsterEntity(
      state.player.gridX + 3,
      state.player.gridY,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(firstTarget);
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    expect(dog.dogVocalTargetId).toBe(firstTarget.id);
    expect(hasDogVocal(state)).toBe(true);

    state.entityManager.destroy(firstTarget.id);
    const secondTarget = new MonsterEntity(
      state.player.gridX + 3,
      state.player.gridY + 1,
      MonsterType.RAT,
      1,
    );
    state.entityManager.spawn(secondTarget);
    state.sim.nowTick += 20;
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    expect(dog.dogVocalTargetId).toBe(secondTarget.id);
    expect(hasDogVocal(state)).toBe(true);
  });

  it("occasionally vocalizes again during a continuing pursuit", () => {
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
    state.entityManager.spawn(dog);
    const target = new MonsterEntity(
      state.player.gridX + 3,
      state.player.gridY,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(target);
    updateMonsterSteering(state);
    state.pendingSounds.length = 0;
    state.sim.nowTick += 120;
    vi.spyOn(RNG, "chance").mockReturnValue(true);

    updateMonsterSteering(state);

    expect(hasDogVocal(state)).toBe(true);
  });

  it("occasionally whimpers near its owner when it has no enemy target", () => {
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
    state.entityManager.spawn(dog);
    state.sim.nowTick = 180;
    vi.spyOn(RNG, "chance").mockReturnValue(true);

    updateMonsterSteering(state);

    expect(
      state.pendingSounds.some((sound) => DOG_WHIMPER_SOUNDS.has(sound.effect)),
    ).toBe(true);
  });

  it("does not whimper while tracking a nearby enemy", () => {
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
    state.entityManager.spawn(dog);
    state.entityManager.spawn(
      new MonsterEntity(
        state.player.gridX + 3,
        state.player.gridY,
        MonsterType.MUTANT,
        1,
      ),
    );
    state.sim.nowTick = 180;
    vi.spyOn(RNG, "chance").mockReturnValue(true);

    updateMonsterSteering(state);

    expect(
      state.pendingSounds.some((sound) => DOG_WHIMPER_SOUNDS.has(sound.effect)),
    ).toBe(false);
  });
});

describe("a hostile Wild Dog pursues the player", () => {
  beforeEach(() => RNG.reseed(9));

  it("vocalizes when the nearby player is visible", () => {
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
    state.tiles.setTile(
      state.player.gridX + 1,
      state.player.gridY,
      TileType.FLOOR,
    );
    state.tiles.setTile(
      state.player.gridX + 2,
      state.player.gridY,
      TileType.FLOOR,
    );
    state.entityManager.spawn(dog);
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    expect(dog.dogVocalTargetId).toBe(state.player.id);
    expect(hasDogVocal(state)).toBe(true);
  });
});
