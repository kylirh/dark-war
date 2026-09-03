/** Server-authoritative discovery and presentation of world signs. */

import { Entity, EntityKind, GameState, SignPlacement } from "../../types";
import { signViewFor } from "../../content/sign-defs";
import { wrapDelta } from "../../utils/wrap";

/** Find a sign on the requested adjacent tile if the player can see it. */
export function findReadableSign(
  state: GameState,
  actor: Entity,
  x: number,
  y: number,
): SignPlacement | null {
  if (actor.kind !== EntityKind.PLAYER) return null;
  const targetX = normalizeTargetCoordinate(state.levelKind, x, state.mapWidth);
  const targetY = normalizeTargetCoordinate(
    state.levelKind,
    y,
    state.mapHeight,
  );
  if (targetX === null || targetY === null) return null;
  const deltaX =
    state.levelKind === "outside"
      ? wrapDelta(actor.gridX, targetX, state.mapWidth)
      : targetX - actor.gridX;
  const deltaY =
    state.levelKind === "outside"
      ? wrapDelta(actor.gridY, targetY, state.mapHeight)
      : targetY - actor.gridY;
  if (
    Math.abs(deltaX) > 1 ||
    Math.abs(deltaY) > 1 ||
    (deltaX === 0 && deltaY === 0)
  ) {
    return null;
  }

  const sign = state.signs.find(
    (candidate) => candidate.x === targetX && candidate.y === targetY,
  );
  if (
    !sign ||
    !signViewFor(sign) ||
    !isVisibleToPlayer(state, actor.id, sign)
  ) {
    return null;
  }
  return sign;
}

/** Build a private reader view from a shared sign placement. */
export function signViewForPlacement(
  state: GameState,
  signId: string,
): ReturnType<typeof signViewFor> {
  const sign = state.signs.find((candidate) => candidate.id === signId);
  return sign ? signViewFor(sign) : undefined;
}

function isVisibleToPlayer(
  state: GameState,
  playerId: string,
  sign: SignPlacement,
): boolean {
  if (!state.options?.fov) return true;
  const index = sign.x + sign.y * state.mapWidth;
  const visible = state.visibilityByPlayer?.get(playerId) ?? state.visible;
  return visible.has(index);
}

function normalizeTargetCoordinate(
  levelKind: GameState["levelKind"],
  value: number,
  size: number,
): number | null {
  if (!Number.isInteger(value)) return null;
  if (levelKind === "outside") {
    return ((value % size) + size) % size;
  }
  return value >= 0 && value < size ? value : null;
}
