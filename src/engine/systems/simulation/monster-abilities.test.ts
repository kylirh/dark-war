import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { EntityKind, MonsterType, EventType } from "../../types";
import { RNG } from "../../utils/rng";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";
import { processMonsterAbilities } from "./tick";

function clearMonsters(game: Game) {
  const state = game.getState();
  state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("icky lumps breed", () => {
  beforeEach(() => RNG.reseed(99));

  it("multiplies into adjacent open tiles over time", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    // One lump next to the player's start room (open floor around it).
    const lump = new MonsterEntity(
      state.player.gridX,
      state.player.gridY + 1,
      MonsterType.ICKY_LUMP,
      1,
    );
    state.entityManager.spawn(lump);

    RNG.reseed(2024);
    // Drive the passive-ability pass directly (no AI wandering / hole falls).
    for (let i = 0; i < 4000; i++) processMonsterAbilities(state);

    const lumpCount = state.entities.filter(
      (e) =>
        e.kind === EntityKind.MONSTER &&
        (e as any).type === MonsterType.ICKY_LUMP,
    ).length;
    expect(lumpCount).toBeGreaterThan(1);
  });
});

describe("flutterbang explodes on death", () => {
  beforeEach(() => RNG.reseed(5));

  it("produces an explosion effect when it dies", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const bat = new MonsterEntity(
      state.player.gridX + 5,
      state.player.gridY,
      MonsterType.FLUTTERBANG,
      1,
    );
    state.entityManager.spawn(bat);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: bat.id },
    });
    processEventQueue(state);

    expect(state.effects.some((e) => e.type === "explosion")).toBe(true);
  });
});
