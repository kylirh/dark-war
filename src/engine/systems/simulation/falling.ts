/** Impact damage shared by offline and authoritative vertical travel. */
import {
  EventType,
  GameState,
  HOLE_FALL_DAMAGE,
  Player,
  TileType,
} from "../../types";
import { haltDyingPlayer, pushEvent } from "./sim-helpers";

/** No impact in an open shaft; quadratic damage is applied once at solid ground. */
export function applyFallLandingDamage(state: GameState, player: Player): void {
  if (state.tiles.getTile(player.gridX, player.gridY) === TileType.HOLE) return;
  const floors = player.fallDistance ?? 0;
  player.fallDistance = undefined;
  if (floors === 0 || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - HOLE_FALL_DAMAGE * floors * floors);
  if (player.hp <= 0) {
    haltDyingPlayer(state, player);
    pushEvent(state, {
      type: EventType.PLAYER_DEATH,
      data: { type: "PLAYER_DEATH", playerId: player.id },
    });
  }
}
