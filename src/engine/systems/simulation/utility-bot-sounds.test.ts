/**
 * Verifies utility-bot social interactions use their dedicated sound cues.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundEffect } from "../../content/sound-effects";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import { EntityKind, ItemType, MonsterType } from "../../types";
import { RNG } from "../../utils/rng";
import { generateAICommands, updateMonsterSteering } from "./ai";

describe("utility bot sounds", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the nuggle cue when a healthy bot nuzzles the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.entityManager.destroyWhere(
      (entity) => entity.kind === EntityKind.MONSTER,
    );

    const bot = new MonsterEntity(
      state.player.gridX,
      state.player.gridY,
      MonsterType.UTILITY_BOT,
      1,
    );
    bot.worldX = state.player.worldX;
    bot.worldY = state.player.worldY;
    state.entityManager.spawn(bot);
    vi.spyOn(RNG, "chance").mockReturnValue(true);

    generateAICommands(state, 121);

    expect(state.pendingSounds.at(-1)?.effect).toBe(
      SoundEffect.UTILITY_BOT_NUGGLE,
    );
  });

  it.each([
    ItemType.METAL_SCRAPS,
    ItemType.TRASH,
    ItemType.RUBBLE_CHUNK,
    ItemType.ROCK,
  ])("cleans %s and always plays a washing cue", (itemType) => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.entityManager.destroyWhere(
      (entity) =>
        entity.kind === EntityKind.MONSTER || entity.kind === EntityKind.ITEM,
    );

    const bot = new MonsterEntity(
      state.player.gridX,
      state.player.gridY,
      MonsterType.UTILITY_BOT,
      1,
    );
    const trash = new ItemEntity(bot.gridX, bot.gridY, itemType);
    state.entityManager.spawn(bot);
    state.entityManager.spawn(trash);
    vi.spyOn(RNG, "choose").mockReturnValue(SoundEffect.UTILITY_BOT_CLEAN_2);

    updateMonsterSteering(state);

    expect(state.entities.some((entity) => entity.id === trash.id)).toBe(false);
    expect(state.pendingSounds.at(-1)).toMatchObject({
      effect: SoundEffect.UTILITY_BOT_CLEAN_2,
      worldX: bot.worldX,
      worldY: bot.worldY,
    });
  });
});
