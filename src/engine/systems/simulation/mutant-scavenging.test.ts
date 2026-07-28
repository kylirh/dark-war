/**
 * Verifies Mutants pursue and consume persistent organic remains.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ITEM_DEFS } from "../../content/item-defs";
import { SoundEffect } from "../../content/sound-effects";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import {
  CELL_CONFIG,
  EntityKind,
  EventType,
  ItemType,
  MonsterType,
  TileType,
} from "../../types";
import { setPositionFromGrid } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import { generateAICommands, updateMonsterSteering } from "./ai";
import { processEventQueue } from "./events";
import { pushEvent } from "./sim-helpers";
import { stepSimulationTick } from "./tick";

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

describe("Mutant scavenging", () => {
  beforeEach(() => RNG.reseed(31));

  it("pursues organic remains even when they lead away from the player", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(14, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(16, 10, ItemType.ENTRAILS);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    updateMonsterSteering(state);

    expect(mutant.velocityX).toBeGreaterThan(0);
    expect(state.entities.some((entity) => entity.id === remains.id)).toBe(
      true,
    );
  });

  it("consumes nearby remains and plays a spatial eating cue", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(12, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(12, 10, ItemType.CORPSE);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    updateMonsterSteering(state);

    expect(state.entities.some((entity) => entity.id === remains.id)).toBe(
      false,
    );
    expect(state.pendingSounds).toContainEqual({
      effect: SoundEffect.MUTANT_EAT,
      worldX: mutant.worldX,
      worldY: mutant.worldY,
      maxDistancePx: CELL_CONFIG.w * 18,
    });
    expect(mutant.digestingUntilTick).toBeGreaterThanOrEqual(
      state.sim.nowTick + 40,
    );
    expect(mutant.digestingUntilTick).toBeLessThanOrEqual(
      state.sim.nowTick + 80,
    );
  });

  it("does not skip later monsters when consuming an earlier item", () => {
    const game = setupGame();
    const state = game.getState();
    const remains = new ItemEntity(12, 10, ItemType.CORPSE);
    const mutant = new MonsterEntity(12, 10, MonsterType.MUTANT, 3);
    const dreadnaught = new MonsterEntity(20, 10, MonsterType.DREADNAUGHT, 3);
    state.entityManager.spawn(remains);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(dreadnaught);

    updateMonsterSteering(state);

    expect(
      state.pendingSounds.some((sound) =>
        [
          SoundEffect.DREADNAUGHT_1,
          SoundEffect.DREADNAUGHT_2,
          SoundEffect.DREADNAUGHT_3,
          SoundEffect.DREADNAUGHT_4,
          SoundEffect.DREADNAUGHT_5,
          SoundEffect.DREADNAUGHT_6,
          SoundEffect.DREADNAUGHT_7,
          SoundEffect.DREADNAUGHT_8,
        ].includes(sound.effect as SoundEffect),
      ),
    ).toBe(true);
  });

  it("lingers without moving or attacking while digesting", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(12, 10, MonsterType.MUTANT, 3);
    const meal = new ItemEntity(12, 10, ItemType.ENTRAILS);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(meal);

    updateMonsterSteering(state);
    const digestionEnd = mutant.digestingUntilTick;
    expect(digestionEnd).toBeDefined();

    state.sim.nowTick = (digestionEnd as number) - 1;
    mutant.velocityX = 100;
    updateMonsterSteering(state);

    expect(mutant.velocityX).toBe(0);
    expect(mutant.velocityY).toBe(0);
    expect(generateAICommands(state, state.sim.nowTick)[0]?.type).toBe("WAIT");
  });

  it("resumes scavenging after digestion finishes", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(14, 10, MonsterType.MUTANT, 3);
    mutant.digestingUntilTick = 50;
    const remains = new ItemEntity(16, 10, ItemType.BLOOD_SPLATTER);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);
    state.sim.nowTick = 50;

    updateMonsterSteering(state);

    expect(mutant.velocityX).toBeGreaterThan(0);
  });

  it("does not attack a player while it is prioritizing a meal", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(14, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(16, 10, ItemType.CORPSE);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    const commands = generateAICommands(state, state.sim.nowTick);

    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe("WAIT");
  });

  it("abandons scavenging when the player is already in melee range", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(11, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(13, 10, ItemType.ENTRAILS);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    updateMonsterSteering(state);
    const command = generateAICommands(state, state.sim.nowTick)[0];

    expect(mutant.velocityX).toBeLessThanOrEqual(0);
    expect(command?.type).toBe("MELEE");
    expect(state.entities.some((entity) => entity.id === remains.id)).toBe(
      true,
    );
  });

  it("keeps fighting briefly after the player hits it, then returns to food", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(14, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(16, 10, ItemType.ENTRAILS);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: mutant.id,
        amount: 1,
        sourceId: state.player.id,
      },
    });
    processEventQueue(state);
    updateMonsterSteering(state);

    expect(mutant.lastPlayerAttackTick).toBe(state.sim.nowTick);
    expect(mutant.velocityX).toBeLessThan(0);

    state.sim.nowTick += 80;
    updateMonsterSteering(state);

    expect(mutant.velocityX).toBeGreaterThan(0);
  });

  it("eats silently when the player is beyond hearing distance", () => {
    const game = setupGame();
    const state = game.getState();
    const mutant = new MonsterEntity(35, 10, MonsterType.MUTANT, 3);
    const remains = new ItemEntity(35, 10, ItemType.BLOOD_SPLATTER);
    state.entityManager.spawn(mutant);
    state.entityManager.spawn(remains);

    updateMonsterSteering(state);

    expect(state.entities.some((entity) => entity.id === remains.id)).toBe(
      false,
    );
    expect(
      state.pendingSounds.some(
        (sound) => sound.effect === SoundEffect.MUTANT_EAT,
      ),
    ).toBe(false);
  });

  it("leaves persistent edible remains when an organic monster dies", () => {
    const game = setupGame();
    const state = game.getState();
    const rat = new MonsterEntity(12, 10, MonsterType.RAT, 3);
    rat.hp = 0;
    state.entityManager.spawn(rat);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: rat.id },
    });
    processEventQueue(state);

    const remains = state.entities.find(
      (entity) =>
        entity.kind === EntityKind.ITEM &&
        ITEM_DEFS[entity.type as ItemType]?.organicDead === true,
    );
    expect(remains).toBeDefined();
  });

  it("does not leave edible organic remains when a robot dies", () => {
    const game = setupGame();
    const state = game.getState();
    const cybercop = new MonsterEntity(12, 10, MonsterType.CYBERCOP, 3);
    cybercop.hp = 0;
    state.entityManager.spawn(cybercop);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: cybercop.id },
    });
    processEventQueue(state);

    expect(
      state.entities.some(
        (entity) =>
          entity.kind === EntityKind.ITEM &&
          ITEM_DEFS[entity.type as ItemType]?.organicDead === true,
      ),
    ).toBe(false);
  });

  it("keeps organic remains out of the player's magnetic pickup", () => {
    const game = setupGame();
    const state = game.getState();
    const remains = new ItemEntity(10, 10, ItemType.ENTRAILS);
    remains.worldX = state.player.worldX;
    remains.worldY = state.player.worldY;
    state.entityManager.spawn(remains);

    stepSimulationTick(state);

    expect(state.entities.some((entity) => entity.id === remains.id)).toBe(
      true,
    );
  });
});
