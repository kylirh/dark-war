/** Authoritative fall damage before a player leaves the source world. */
import {
  EventType,
  GameState,
  HOLE_FALL_DAMAGE,
  Player,
} from "../src/engine/types";
import {
  haltDyingPlayer,
  pushEvent,
} from "../src/engine/systems/simulation/sim-helpers";

/** Return whether the player survived and may migrate to the landing world. */
export function applyHoleFallDamage(state: GameState, player: Player): boolean {
  if (player.hp <= 0) return false;
  player.hp = Math.max(0, player.hp - HOLE_FALL_DAMAGE);
  if (player.hp > 0) return true;
  haltDyingPlayer(state, player);
  pushEvent(state, {
    type: EventType.PLAYER_DEATH,
    data: { type: "PLAYER_DEATH", playerId: player.id },
  });
  return false;
}
