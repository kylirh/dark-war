/** Tests for Marda's persisted, interruptible builder occupation. */

import { describe, expect, it } from "vitest";
import { Game } from "../../core/game";
import {
  consumeSpawnMarker,
  stableSpawnMarkerId,
  WORKSHOP_BUILDER_ID,
} from "../../core/actor-factory";
import { EntityKind, Monster, TileType } from "../../types";
import { getStateDamageAtIndex, setStateTile } from "../../utils/state-tiles";
import { applyWallDamageAt } from "../../utils/walls";
import { idxFor } from "../../utils/helpers";
import { generateAICommands, updateMonsterSteering } from "./ai";
import { resolveCommand } from "./commands";

function mardaIn(game: Game): Monster {
  const marda = game
    .getState()
    .entities.find((entity) => entity.id === WORKSHOP_BUILDER_ID);
  expect(marda?.kind).toBe(EntityKind.MONSTER);
  return marda as Monster;
}

describe("builder occupation", () => {
  it("scores visible work, repairs it, and records a persisted decision", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();
    const marda = mardaIn(game);
    const targetX = marda.gridX + 1;
    const targetY = marda.gridY;
    setStateTile(state, targetX, targetY, TileType.FLOOR);
    applyWallDamageAt(state, targetX, targetY, 6);

    updateMonsterSteering(state);
    expect(marda.agent?.currentGoal).toBe("work");
    expect(marda.agent?.activity).toEqual({
      kind: "repair",
      targetX,
      targetY,
    });
    expect(marda.agent?.lastDecision?.candidates).toContainEqual({
      goal: "work",
      score: 600,
      reason: "reachable repair in work region",
    });

    const repair = generateAICommands(state, state.sim.nowTick).find(
      (command) => command.actorId === marda.id,
    );
    expect(repair?.data.type).toBe("REPAIR");
    resolveCommand(state, repair!);
    expect(
      getStateDamageAtIndex(state, idxFor(targetX, targetY, state.mapWidth)),
    ).toBe(3);

    const epoch = marda.agent!.decisionEpoch;
    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    expect(mardaIn(restored).agent?.decisionEpoch).toBe(epoch);
  });

  it("keeps the builder peaceful while following and interrupts work for danger", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();
    const marda = mardaIn(game);
    marda.ownerId = state.player.id;
    marda.alertLevel = 100;
    marda.lastAttackerId = state.player.id;

    updateMonsterSteering(state);
    expect(marda.agent?.currentGoal).toBe("flee");
    expect(marda.occupation?.type).toBe("builder");
    expect(marda.peaceful).toBe(true);
  });
});

describe("consumed spawn-marker ledger", () => {
  it("persists marker provenance and never respawns a consumed marker", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const initial = game.getState().consumedSpawnMarkers;
    expect(initial.size).toBe(2);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    expect(restored.getState().consumedSpawnMarkers).toEqual(initial);

    const id = stableSpawnMarkerId(
      { spaceId: "outside", planeId: "surface" },
      "test-prefab@1,2:identity",
      7,
    );
    const ledger = new Set<string>();
    expect(consumeSpawnMarker(ledger, id, () => "spawned")).toBe("spawned");
    expect(consumeSpawnMarker(ledger, id, () => "duplicate")).toBeNull();
  });
});
