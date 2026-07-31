/**
 * Social interaction resolution.
 *
 * Talking is triggered by the existing `INTERACT` command and produces an
 * `NPC_TALK` event. Content comes from `SOCIAL_DEFS`; the actor entity carries
 * only a `social` component. Greeting selection is a deterministic keyed roll so
 * it is reproducible across save/load and identical on every peer.
 */

import { GameState, Entity, EntityKind, EventType, Player } from "../../types";
import { pushEvent } from "./sim-helpers";
import { grantCoreDevice } from "./events";
import { SOCIAL_DEFS } from "../../content/social-defs";
import { deterministicChoice } from "../../utils/deterministic-roll";

/** Whether an entity can currently be talked to. */
export function canTalkTo(entity: Entity): boolean {
  return (
    !!entity.social &&
    !!entity.interactable &&
    entity.interactable.affordances.includes("talk")
  );
}

/**
 * The talkable actor an interaction targets: one exactly on the targeted tile,
 * else the nearest talkable actor adjacent to the interacting actor.
 */
export function findTalkTarget(
  state: GameState,
  actor: Entity,
  x: number,
  y: number,
): Entity | null {
  const atTile = state.entities.find(
    (e) => e.id !== actor.id && canTalkTo(e) && e.gridX === x && e.gridY === y,
  );
  if (atTile) return atTile;
  return (
    state.entities.find(
      (e) =>
        e.id !== actor.id &&
        canTalkTo(e) &&
        Math.abs(e.gridX - actor.gridX) <= 1 &&
        Math.abs(e.gridY - actor.gridY) <= 1,
    ) ?? null
  );
}

/**
 * Voice a talkable actor: first-meet lines (and any one-time gift) once, then a
 * repeatable greeting. `actor` is the interacting entity (gifts go to it).
 */
export function resolveTalk(
  state: GameState,
  actor: Entity,
  target: Entity,
): void {
  const social = target.social;
  if (!social) return;
  const def = SOCIAL_DEFS[social.defId];
  if (!def) return;

  const flags = (social.flags ??= {});
  const lines: string[] = [];
  if (def.firstMeet && !flags.met) {
    lines.push(...def.firstMeet);
    flags.met = true;
    // Hand over one-time starting gear to the interacting player.
    if (def.gifts && actor.kind === EntityKind.PLAYER) {
      for (const gift of def.gifts) {
        grantCoreDevice(actor as Player, gift);
      }
    }
  }

  lines.push(
    deterministicChoice(
      {
        simulationSeed: state.simulationSeed,
        actorStableId: target.id,
        decisionEpoch: state.sim.nowTick,
        purpose: "social-greeting",
      },
      def.greeting,
    ),
  );

  pushEvent(state, {
    type: EventType.NPC_TALK,
    data: { type: "NPC_TALK", npcId: target.id, message: lines.join(" ") },
  });
}
