import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import {
  EntityKind,
  EventType,
  ItemType,
  Monster,
  MonsterType,
} from "../../types";
import { MonsterEntity } from "../../entities/monster-entity";
import { SoundEffect } from "../../content/sound-effects";
import { RNG } from "../../utils/rng";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";
import { triggerExplosion } from "./explosives";

/** Build a real dungeon state and return the game plus its first monster. */
function gameWithMonster(): { game: Game; monster: Monster } {
  RNG.reseed(2024);
  const game = new Game({ mode: "offline" });
  game.reset(1);
  const monster = game
    .getState()
    .entities.find((e) => e.kind === EntityKind.MONSTER) as Monster;
  return { game, monster };
}

describe("damage → death event pipeline", () => {
  beforeEach(() => RNG.reseed(2024));

  it("removes a monster from the world when damage is lethal", () => {
    const { game, monster } = gameWithMonster();
    const state = game.getState();
    expect(monster).toBeDefined();

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: monster.id, amount: monster.hp + 100 },
    });
    processEventQueue(state);

    expect(state.entities.some((e) => e.id === monster.id)).toBe(false);
  });

  it("leaves a monster alive after non-lethal damage", () => {
    const { game, monster } = gameWithMonster();
    const state = game.getState();
    const startHp = monster.hp;
    if (startHp <= 1) return; // skip degenerate 1-hp case

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: monster.id, amount: 1 },
    });
    processEventQueue(state);

    const survivor = state.entityManager.getById(monster.id) as Monster;
    expect(survivor).toBeDefined();
    expect(survivor.hp).toBe(startHp - 1);
  });

  it("routes monster removal through the entity manager (removedIds tracked)", () => {
    const { game, monster } = gameWithMonster();
    const state = game.getState();
    state.entityManager.clearLifecycle();

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: monster.id, amount: monster.hp + 100 },
    });
    processEventQueue(state);

    expect(state.entityManager.removedIds.has(monster.id)).toBe(true);
  });

  it.each([
    MonsterType.CYBERCOP,
    MonsterType.UTILITY_BOT,
    MonsterType.DREADNAUGHT,
  ])("does not play a death cry for a %s", (monsterType) => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const robot = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      monsterType,
      1,
    );
    state.entityManager.spawn(robot);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: robot.id },
    });
    processEventQueue(state);

    const deathSounds = [
      SoundEffect.MONSTER_DEATH_1,
      SoundEffect.MONSTER_DEATH_2,
      SoundEffect.MONSTER_DEATH_3,
      SoundEffect.MONSTER_DEATH_4,
    ];
    expect(
      state.pendingSounds.some((sound) =>
        deathSounds.some((deathSound) => sound.effect === deathSound),
      ),
    ).toBe(false);
  });

  it("still plays a death cry for an organic monster", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const mutant = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(mutant);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: mutant.id },
    });
    processEventQueue(state);

    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.MONSTER_DEATH_1 ||
          sound.effect === SoundEffect.MONSTER_DEATH_2 ||
          sound.effect === SoundEffect.MONSTER_DEATH_3 ||
          sound.effect === SoundEffect.MONSTER_DEATH_4,
      ),
    ).toBe(true);
  });
});

describe("explosion event pipeline", () => {
  beforeEach(() => RNG.reseed(2024));

  it("damages (or destroys) a monster caught in the blast", () => {
    const { game, monster } = gameWithMonster();
    const state = game.getState();
    const hpBefore = monster.hp;

    triggerExplosion(state, monster.worldX, monster.worldY, ItemType.GRENADE);
    processEventQueue(state);

    const survivor = state.entityManager.getById(monster.id) as
      | Monster
      | undefined;
    // Either it took blast damage or it was destroyed outright.
    expect(survivor === undefined || survivor.hp < hpBefore).toBe(true);
  });
});
