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
import { WorldAddress, worldAddressKey } from "./world-space";

/**
 * Stable, idempotent identity for the outside-world workshop builder. Derived
 * from its world plane so a regenerating level cannot spawn a second copy under
 * a different id.
 */
export const WORKSHOP_BUILDER_ID = "npc:outside/surface:workshop-builder";
const BUILDER_WORK_TICKS = 900;
const BUILDER_REST_TICKS = 300;

/** Stable provenance key for one authored or prefab-backed spawn marker. */
export function stableSpawnMarkerId(
  address: WorldAddress,
  prefabInstanceId: string,
  markerId: string | number,
): string {
  return `${worldAddressKey(address)}:${prefabInstanceId}:marker:${markerId}`;
}

/** Consume a stable spawn marker exactly once. */
export function consumeSpawnMarker<T>(
  ledger: Set<string>,
  markerId: string,
  create: () => T,
): T | null {
  if (ledger.has(markerId)) return null;
  ledger.add(markerId);
  return create();
}

function configureBuilder(
  builder: MonsterEntity,
  gridX: number,
  gridY: number,
  phaseOffset: number,
): void {
  builder.peaceful = true;
  builder.interactable = { affordances: ["talk"] };
  builder.agent = {
    decisionEpoch: 0,
    nextDecisionTick: 0,
    currentGoal: "idle",
  };
  builder.occupation = {
    type: "builder",
    home: {
      worldSpaceId: "outside",
      worldPlaneId: "surface",
      x: gridX,
      y: gridY,
    },
    workRadius: 12,
    schedule: {
      workTicks: BUILDER_WORK_TICKS,
      restTicks: BUILDER_REST_TICKS,
      phaseOffset,
    },
  };
}

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
  builder.name = "Marda";
  builder.social = { defId: "settler.workshop-builder" };
  configureBuilder(builder, gridX, gridY, 0);
  return builder;
}

/**
 * A second settler tending the park workshop. Spawned from the workshop-garden
 * prefab's `npc.builder` marker; `stableId` is derived from that marker so a
 * regenerating level cannot duplicate them. Hands over no gear (Marda does that
 * at the start).
 */
export function createParkBuilder(
  gridX: number,
  gridY: number,
  stableId: string,
): MonsterEntity {
  const builder = new MonsterEntity(
    gridX,
    gridY,
    MonsterType.WORKSHOP_BUILDER,
    0,
  );
  builder.id = stableId;
  builder.name = "Bram";
  builder.social = { defId: "settler.park-builder" };
  configureBuilder(builder, gridX, gridY, 600);
  return builder;
}
