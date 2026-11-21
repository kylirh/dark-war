/**
 * The two BFS helpers behind utility-bot steering share module-level scratch
 * buffers (`ai.ts`), reused across calls so a search costs no allocation. That
 * is only safe because each getter resets the whole buffer before handing it
 * out — a leftover entry from an earlier search would otherwise read as
 * "already visited" and stop the next search dead.
 *
 * Nothing exercised that. With both resets deleted the entire suite still
 * passed, because every existing utility-bot test drives exactly one search
 * per buffer, and a buffer is only stale on the *second* use. These tests put
 * two bots in one steering pass so each buffer is used twice.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { Monster, MonsterType, TileType } from "../../types";
import { RNG } from "../../utils/rng";
import { setStateTile } from "../../utils/state-tiles";
import { updateMonsterSteering } from "./ai";
import { clearMonsters } from "./test-utils";

/**
 * `steerUtilityBot` reaches for this through `monster as any`, so it is not on
 * the `Monster` type. Named here rather than widening the production type.
 */
type RepairingBot = Monster & {
  currentRepairTarget: [number, number] | null;
};

/** A dungeon at depth 1 with no generated monsters and one repairable hole. */
function botsWithOneRepairTarget(): {
  first: RepairingBot;
  second: RepairingBot;
} {
  const game = new Game({ mode: "offline" });
  game.reset(1);
  clearMonsters(game);
  const state = game.getState();

  // The depth-1 start room is open around the player; see the map probe in the
  // pull request that added this file. A hole is repairable without being
  // traversable, so it is a target the BFS reaches but never walks onto.
  setStateTile(
    state,
    state.player.gridX + 4,
    state.player.gridY,
    TileType.HOLE,
  );

  const spawn = (dy: number): RepairingBot => {
    const bot = new MonsterEntity(
      state.player.gridX - 3,
      state.player.gridY + dy,
      MonsterType.UTILITY_BOT,
      1,
    );
    state.entityManager.spawn(bot);
    return bot as unknown as RepairingBot;
  };

  // Two bots, so each shared buffer is used twice in one steering pass.
  const first = spawn(-2);
  const second = spawn(2);
  updateMonsterSteering(state);
  return { first, second };
}

describe("utility bot repair search reuses its scratch buffers safely", () => {
  beforeEach(() => RNG.reseed(7));

  it("finds a repair target for the second bot in the same pass", () => {
    const { first, second } = botsWithOneRepairTarget();

    // Without `visited.fill(0)`, the second search starts with the first
    // search's flood still marked and returns null immediately.
    expect(first.currentRepairTarget).not.toBeNull();
    expect(second.currentRepairTarget).not.toBeNull();
    expect(second.currentRepairTarget).toEqual(first.currentRepairTarget);
  });

  it("still paths the second bot toward that target", () => {
    const { first, second } = botsWithOneRepairTarget();

    // Without `parent.fill(-1)`, the second `botNextStep` sees the first
    // search's parents as visited, finds no route, and `steerTowardGrid`
    // zeroes the velocity instead of stepping.
    for (const bot of [first, second]) {
      expect(Math.hypot(bot.velocityX, bot.velocityY)).toBeGreaterThan(0);
    }
  });
});
