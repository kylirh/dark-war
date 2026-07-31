/**
 * Factories for authored social actors.
 *
 * An actor is an ordinary entity wearing optional social components — there is
 * no dedicated NPC entity type (see docs/ACTORS-AND-SOCIAL-SYSTEMS.md). The
 * workshop builder is a peaceful `MONSTER`-kind entity carrying `social` and
 * `interactable` components; `EntityKind` stays a purely physical discriminator.
 */

import { MonsterEntity } from "../entities/monster-entity";
import { MonsterType } from "../types";

/**
 * Stable, idempotent identity for the outside-world workshop builder. Derived
 * from its world plane so a regenerating level cannot spawn a second copy under
 * a different id.
 */
export const WORKSHOP_BUILDER_ID = "npc:outside/surface:workshop-builder";

/** Build the peaceful workshop builder at a grid cell. */
export function createWorkshopBuilder(
  gridX: number,
  gridY: number,
): MonsterEntity {
  const builder = new MonsterEntity(
    gridX,
    gridY,
    MonsterType.WORKSHOP_BUILDER,
    0,
  );
  builder.id = WORKSHOP_BUILDER_ID;
  builder.peaceful = true;
  builder.social = { defId: "settler.workshop-builder", flags: {} };
  builder.interactable = { affordances: ["talk"] };
  return builder;
}
