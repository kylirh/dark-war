import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { EntityKind, MonsterType, ItemType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("multi-hit creatures", () => {
  beforeEach(() => RNG.reseed(1));

  it("a tentacular horror's strike deals its damage several times", () => {
    const game = new Game({ mode: "offline" });
    game.reset(6);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.armor = 0;
    player.hpMax = 999;
    player.hp = 999;
    const hp0 = player.hp;

    const horror = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.TENTACULAR_HORROR,
      6,
    );
    horror.nextActTick = 0;
    state.entityManager.spawn(horror);

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: horror.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: player.id },
      priority: 0,
      source: "AI",
    });
    stepSimulationTick(state);

    // 3x its per-hit damage (multiHit: 3) — far more than a single bite.
    expect(hp0 - player.hp).toBe(horror.dmg * 3);
  });
});

describe("thieves steal and flee", () => {
  beforeEach(() => RNG.reseed(5));

  it("a moppet grabs coins and turns to flee", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.hpMax = 999;
    player.hp = 999; // survive long enough to be robbed
    player.itemCounts[ItemType.COIN] = 10;

    const moppet = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.MOPPET,
      3,
    );
    state.entityManager.spawn(moppet);

    for (let i = 0; i < 120; i++) {
      stepSimulationTick(state);
      if (moppet.fleeing) break;
    }

    expect(moppet.fleeing).toBe(true);
    expect(player.itemCounts[ItemType.COIN] ?? 0).toBeLessThan(10);
    expect(moppet.carriedItems.some((c) => c.type === ItemType.COIN)).toBe(
      true,
    );
  });
});
