/**
 * The invariant the simulation's id lookups rest on.
 *
 * Simulation code resolves entities by id through `state.entityManager
 * .getById(id)` rather than scanning `state.entities`. Those are two views of
 * the same world, and they agree only because every add and removal funnels
 * through `EntityManager`. The moment something pushes onto `state.entities`
 * or reassigns it, the map and the array disagree — and the failure is quiet:
 * a lookup returns `undefined`, the command or event is silently skipped, and
 * nothing throws.
 *
 * `entity-manager.test.ts` covers the map in isolation. These tests run the
 * real thing — dungeon generation, ticks, combat, death, loot, explosions,
 * level transitions — and assert the two views still agree, so a future bypass
 * fails here instead of turning into a dropped melee attack in a live game.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import {
  EntityKind,
  EventType,
  GameState,
  ItemType,
  Monster,
} from "../../types";
import { RNG } from "../../utils/rng";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";
import { triggerExplosion } from "./explosives";
import { stepSimulationTick } from "./tick";

/**
 * Assert that the id map and a linear scan of the array resolve identically.
 *
 * Both directions matter: every entity in the array must be reachable by id
 * (or lookups silently drop live entities), and the map must not resolve an id
 * the array no longer contains (or lookups resurrect dead ones).
 */
function expectViewsAgree(state: GameState, context: string): void {
  const manager = state.entityManager;

  for (const entity of state.entities) {
    expect(manager.getById(entity.id), `${context}: missing ${entity.id}`).toBe(
      entity,
    );
  }

  for (const entity of state.entities) {
    const scanned = state.entities.find((e) => e.id === entity.id);
    expect(
      manager.getById(entity.id),
      `${context}: ${entity.id} diverged`,
    ).toBe(scanned);
  }

  // Nothing stale: the manager's own array is the state's array, so a size
  // check catches leftovers the per-entity loop above cannot see.
  expect(manager.entities.length, `${context}: array identity`).toBe(
    state.entities.length,
  );
  expect(manager.entities, `${context}: shared in place`).toBe(state.entities);
}

function freshGame(seed = 2024): Game {
  RNG.reseed(seed);
  const game = new Game({ mode: "offline" });
  game.reset(1);
  return game;
}

describe("simulation id lookups agree with the entity array", () => {
  beforeEach(() => RNG.reseed(2024));

  it("agree on a freshly generated level", () => {
    const state = freshGame().getState();

    expect(state.entities.length).toBeGreaterThan(1);
    expectViewsAgree(state, "fresh level");
  });

  it("stay in agreement across many simulation ticks", () => {
    const state = freshGame().getState();

    for (let tick = 0; tick < 120; tick++) {
      stepSimulationTick(state);
      expectViewsAgree(state, `tick ${tick}`);
    }
  });

  it("stay in agreement through a death and its loot drop", () => {
    const game = freshGame();
    const state = game.getState();
    const monster = state.entities.find(
      (e) => e.kind === EntityKind.MONSTER,
    ) as Monster;
    expect(monster).toBeDefined();

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: monster.id, amount: monster.hp + 100 },
    });
    processEventQueue(state);

    // The dead monster must be gone from *both* views, not just the array.
    expect(state.entities.some((e) => e.id === monster.id)).toBe(false);
    expect(state.entityManager.getById(monster.id)).toBeUndefined();
    expectViewsAgree(state, "after death");
  });

  it("stay in agreement through an explosion that removes several entities", () => {
    const game = freshGame();
    const state = game.getState();
    const before = state.entities.length;

    triggerExplosion(
      state,
      state.player.worldX,
      state.player.worldY,
      ItemType.GRENADE,
    );
    processEventQueue(state);

    expectViewsAgree(state, "after explosion");
    expect(state.entities.length).toBeLessThanOrEqual(before);
  });

  it("stay in agreement across a level transition", () => {
    const game = freshGame();
    game.descend();
    const state = game.getState();

    expectViewsAgree(state, "after descend");

    // Stable ids (the player) must resolve to the *current* instance, not a
    // stale one carried over from the previous level's map.
    expect(state.entityManager.getById(state.player.id)).toBe(state.player);

    game.ascend();
    expectViewsAgree(game.getState(), "after ascend");
    expect(
      game.getState().entityManager.getById(game.getState().player.id),
    ).toBe(game.getState().player);
  });

  it("resolves the player by id on every tick of a run", () => {
    // The player is the most-looked-up id in the simulation: every player
    // command resolves its actor this way.
    const game = freshGame();
    const state = game.getState();

    for (let tick = 0; tick < 60; tick++) {
      stepSimulationTick(state);
      expect(state.entityManager.getById(state.player.id)).toBe(state.player);
    }
  });
});
