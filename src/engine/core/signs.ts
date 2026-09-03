/** Validation and prefab conversion for sparse, non-blocking world signs. */

import { SignPlacement } from "../types";
import { StampedPrefabMarker } from "./semantic-prefab";
import { SIGN_DEFS } from "../content/sign-defs";

/** Validate sign identity, content, and plane bounds before it enters state. */
export function validateSigns(
  signs: readonly SignPlacement[],
  width: number,
  height: number,
): void {
  const ids = new Set<string>();
  for (const sign of signs) {
    if (!sign.id || ids.has(sign.id)) {
      throw new Error(`Invalid sign placement id: ${sign.id}`);
    }
    ids.add(sign.id);
    if (!SIGN_DEFS[sign.definitionId]) {
      throw new Error(`Unknown sign definition: ${sign.definitionId}`);
    }
    if (
      !Number.isInteger(sign.x) ||
      !Number.isInteger(sign.y) ||
      sign.x < 0 ||
      sign.y < 0 ||
      sign.x >= width ||
      sign.y >= height
    ) {
      throw new Error(`Sign ${sign.id} is outside the world plane`);
    }
  }
}

/** Convert a compiled prefab sign marker into a stable world placement. */
export function signPlacementFromMarker(
  marker: StampedPrefabMarker,
  prefabInstanceId: string,
): SignPlacement {
  if (marker.kind !== "sign") {
    throw new Error("Only sign markers can become sign placements");
  }
  const definitionId = marker.properties["darkwar.sign"];
  if (typeof definitionId !== "string") {
    throw new Error(
      `Sign marker ${marker.name || marker.id} is missing darkwar.sign`,
    );
  }
  if (!SIGN_DEFS[definitionId]) {
    throw new Error(`Unknown sign definition: ${definitionId}`);
  }
  return {
    id: `${prefabInstanceId}:sign:${marker.id}`,
    definitionId,
    x: marker.worldX,
    y: marker.worldY,
  };
}
