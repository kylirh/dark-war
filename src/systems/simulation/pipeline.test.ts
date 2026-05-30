import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { EntityKind, EventType, Monster } from "../../types";
import { RNG } from "../../utils/rng";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";

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

    const survivor = state.entities.find((e) => e.id === monster.id) as Monster;
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
});
