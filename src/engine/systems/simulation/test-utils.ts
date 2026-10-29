/**
 * Shared helpers for the simulation test suites.
 *
 * Not collected as a suite itself: the Vitest `include` globs only match
 * files ending in `.test.ts`.
 */

import { Game } from "../../core/game";
import { EntityKind, Entity } from "../../types";

/** Remove every monster from the level, leaving players and items in place. */
export function clearMonsters(game: Game): void {
  game
    .getState()
    .entityManager.destroyWhere((e: Entity) => e.kind === EntityKind.MONSTER);
}
