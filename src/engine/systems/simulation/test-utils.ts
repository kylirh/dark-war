import { Game } from "../../core/game";
import { EntityKind, Entity } from "../../types";

export function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e: Entity) => e.kind === EntityKind.MONSTER);
}
