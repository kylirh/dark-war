/** Relationship-derived Snagglepuss stance and recruitment helpers. */

import { isWonOver, RelationshipState } from "../../core/relationship-graph";
import {
  EntityKind,
  GameState,
  Monster,
  MonsterType,
  Player,
} from "../../types";

export function snagglepussRelationship(
  state: GameState,
  playerId: string,
  snagglepussId: string,
): RelationshipState {
  return state.relationships.get(playerId, snagglepussId);
}

export function playerHasWonOverSnagglepuss(
  state: GameState,
  playerId: string,
  snagglepussId: string,
): boolean {
  return isWonOver(snagglepussRelationship(state, playerId, snagglepussId));
}

export function isSnagglepussCompanion(
  state: GameState,
  monster: Monster,
): boolean {
  return (
    monster.type === MonsterType.SNAGGLEPUSS &&
    !!monster.ownerId &&
    playerHasWonOverSnagglepuss(state, monster.ownerId, monster.id)
  );
}

/** A won-over creature may be recruited only when it is not already owned. */
export function recruitSnagglepuss(
  state: GameState,
  monster: Monster,
  playerId: string,
): boolean {
  if (
    monster.type !== MonsterType.SNAGGLEPUSS ||
    monster.ownerId ||
    !playerHasWonOverSnagglepuss(state, playerId, monster.id)
  ) {
    return false;
  }
  monster.ownerId = playerId;
  monster.friendly = true;
  monster.fleeing = false;
  monster.peaceful = false;
  monster.name = monster.name ?? "Snagglepuss";
  if (monster.agent) {
    monster.agent.currentGoal = "companion";
    monster.agent.nextDecisionTick = state.sim.nowTick;
  }
  return true;
}

/** Remove stale companion flags when its owner relationship no longer qualifies. */
export function reconcileSnagglepussCompanion(
  state: GameState,
  monster: Monster,
): void {
  if (monster.type !== MonsterType.SNAGGLEPUSS) return;
  if (monster.ownerId && !isSnagglepussCompanion(state, monster)) {
    monster.ownerId = undefined;
    monster.friendly = false;
    if (monster.agent) {
      monster.agent.currentGoal = "idle";
      monster.agent.nextDecisionTick = state.sim.nowTick;
    }
  } else if (monster.ownerId) {
    monster.friendly = true;
  }
}

/** Closest living player this Snagglepuss still considers hostile. */
export function closestHostilePlayerForSnagglepuss(
  state: GameState,
  monster: Monster,
): Player | null {
  let closest: Player | null = null;
  let closestDistanceSq = Number.POSITIVE_INFINITY;
  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.PLAYER || entity.hp <= 0) continue;
    if (playerHasWonOverSnagglepuss(state, entity.id, monster.id)) continue;
    const distanceSq =
      (entity.worldX - monster.worldX) ** 2 +
      (entity.worldY - monster.worldY) ** 2;
    if (distanceSq < closestDistanceSq) {
      closest = entity;
      closestDistanceSq = distanceSq;
    }
  }
  return closest;
}
