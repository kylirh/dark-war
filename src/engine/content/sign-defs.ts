/** Data-driven environmental sign content for authored and generated worlds. */

import { SignView } from "../types";

export interface SignDefinition {
  readonly title: string;
  readonly text: string;
  /** Semantic artwork family consumed by presentation, never gameplay. */
  readonly artKey: string;
}

export const SIGN_DEFS: Readonly<Record<string, SignDefinition>> = {
  "surface.park-welcome": {
    title: "Civic Park",
    text: "Welcome back, builder. The paths may be cracked, but they still lead somewhere good. Keep what can be repaired, plant what can grow, and leave a light on for the next traveler.",
    artKey: "park-wayfinding",
  },
  "settlement.workshop-notice": {
    title: "Workshop Notice",
    text: "Community repair shop: tools, seeds, and sensible advice inside. If a machine is making a worrying noise, bring it here before it becomes an exciting noise.",
    artKey: "workshop-notice",
  },
};

/** Resolve authored sign content without coupling world state to UI markup. */
export function signViewFor(
  placement: SignPlacementLike,
): SignView | undefined {
  const definition = SIGN_DEFS[placement.definitionId];
  if (!definition) return undefined;
  return {
    id: placement.id,
    title: definition.title,
    text: definition.text,
    artKey: definition.artKey,
  };
}

interface SignPlacementLike {
  id: string;
  definitionId: string;
}
