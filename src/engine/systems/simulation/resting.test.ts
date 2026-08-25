import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { CommandType, EntityKind, EventType, MonsterType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { processEventQueue } from "./events";
import {
  areAllLivingPlayersResting,
  hasRestThreat,
  pushEvent,
} from "./sim-helpers";
import { REST_DAMAGE_MULTIPLIER, REST_HEAL_INTERVAL_TICKS } from "./constants";
import { stepSimulationTick } from "./tick";

function emptyGame(mode: "offline" | "online" = "offline"): Game {
  const game = new Game({ mode });
  game.reset(1);
  game
    .getState()
    .entityManager.destroyWhere((entity) => entity.kind === EntityKind.MONSTER);
  return game;
}

function wait(game: Game): void {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.WAIT,
    data: { type: "WAIT" },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

describe("player resting", () => {
  beforeEach(() => RNG.reseed(1234));

  it("starts through WAIT, stops movement, and rejects full-health rest", () => {
    const game = emptyGame();
    const state = game.getState();
    const player = state.player;

    player.hp = player.hpMax - 1;
    player.hasCTDM = true;
    player.ctdmEnabled = true;
    player.velocityX = 100;
    player.velocityY = -50;
    wait(game);

    expect(player.resting).toBe(true);
    expect(player.velocityX).toBe(0);
    expect(player.velocityY).toBe(0);
    expect(state.sim.targetTimeScale).toBeGreaterThan(1);

    wait(game);
    expect(player.resting).toBe(false);

    player.hp = player.hpMax;
    wait(game);
    expect(player.resting).toBe(false);
    expect(state.story[0]).toBe("You are already fully healed.");
  });

  it("uses the viewing-distance radius rule to block nearby enemies", () => {
    const game = emptyGame();
    const state = game.getState();
    const player = state.player;
    player.hp = player.hpMax - 1;

    const nearby = new MonsterEntity(
      player.gridX + 2,
      player.gridY,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(nearby);
    expect(hasRestThreat(state, player)).toBe(true);

    wait(game);
    expect(player.resting).toBe(false);
    expect(state.story[0]).toBe("You cannot rest while an enemy is nearby.");

    nearby.worldX = player.worldX + player.sight * 32 * 2;
    nearby.worldY = player.worldY;
    expect(hasRestThreat(state, player)).toBe(false);
  });

  it("heals over simulated time and wakes at full health", () => {
    const game = emptyGame();
    const state = game.getState();
    state.player.hp = state.player.hpMax - 2;
    wait(game);

    for (let i = 0; i < REST_HEAL_INTERVAL_TICKS * 2 + 2; i++) {
      stepSimulationTick(state);
    }

    expect(state.player.hp).toBe(state.player.hpMax);
    expect(state.player.resting).toBe(false);
  });

  it("wakes on damage and applies the resting damage multiplier", () => {
    const game = emptyGame();
    const state = game.getState();
    state.player.hp = 10;
    const attacker = new MonsterEntity(
      state.player.gridX + 20,
      state.player.gridY,
      MonsterType.MUTANT,
      1,
    );
    state.entityManager.spawn(attacker);
    wait(game);
    expect(state.player.resting).toBe(true);

    // The enemy approaches after rest begins.
    attacker.worldX = state.player.worldX + 16;
    attacker.worldY = state.player.worldY;

    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: state.player.id,
        amount: 2,
        sourceId: attacker.id,
      },
    });
    processEventQueue(state);

    expect(state.player.hp).toBe(10 - 2 * REST_DAMAGE_MULTIPLIER);
    expect(state.player.resting).toBe(false);
  });

  it("preserves resting state through save/load", () => {
    const game = emptyGame();
    game.getState().player.hp = 10;
    wait(game);
    const serialized = game.serialize();

    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);

    expect(restored.getState().player.resting).toBe(true);
    expect(restored.getState().player.restNextHealTick).toBe(
      game.getState().player.restNextHealTick,
    );
  });

  it("accelerates only when all living players on an online plane rest", () => {
    const game = emptyGame("online");
    const state = game.getState();
    const first = state.player;
    const second = game.addNetworkPlayer("player-2");
    first.hp = first.hpMax - 1;
    second.hp = second.hpMax - 1;
    first.resting = true;

    expect(areAllLivingPlayersResting(state)).toBe(false);
    second.resting = true;
    expect(areAllLivingPlayersResting(state)).toBe(true);

    game.removeNetworkPlayer(second.id);
    expect(areAllLivingPlayersResting(state)).toBe(true);
  });
});
