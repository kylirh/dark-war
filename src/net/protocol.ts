/**
 * Shared multiplayer protocol definitions.
 *
 * Imported by both the client (`src/net/multiplayer-client.ts`) and the
 * authoritative server (`server/multiplayer-server.ts`). Bump
 * PROTOCOL_VERSION whenever the wire format changes in a way that would
 * make an old client and new server (or vice versa) misinterpret messages.
 * The server stamps its version in the `welcome` message and clients refuse
 * to play on a mismatch rather than silently desyncing.
 *
 * `NetworkAction` lives here so the two ends cannot drift: it is the wire
 * shape the client sends and the server validates, so changing a member is
 * a wire-format change and needs a PROTOCOL_VERSION bump.
 *
 * `isNetworkAction` lives beside it for the same reason. It is the gate on the
 * server's inbound `action` payloads, and its accepted tags are derived from
 * the union rather than restated, so a new member cannot be added without the
 * validator learning to accept it.
 */
export const PROTOCOL_VERSION = 15;

export type NetworkAction =
  | {
      type: "FIRE";
      dx: number;
      dy: number;
      facingAngle?: number;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | {
      type: "USE_ITEM";
      dx: number;
      dy: number;
      facingAngle?: number;
      targetWorldX?: number;
      targetWorldY?: number;
    }
  | { type: "INTERACT"; dx: number; dy: number }
  | { type: "SIGN_CLOSE" }
  | { type: "PICKUP" }
  | { type: "RELOAD" }
  | { type: "WAIT" }
  | { type: "DESCEND" }
  | { type: "ASCEND" }
  | { type: "SHAPE_TERRAIN"; tileX: number; tileY: number; delta: -1 | 1 }
  | { type: "SPEAK"; kind: "speech" | "thought"; text: string }
  | {
      type: "DIALOGUE_CHOICE";
      choiceId: string;
      freeText?: string;
      expectedRevision: number;
    }
  | { type: "DIALOGUE_LEAVE"; expectedRevision: number }
  | { type: "TOGGLE_GOD_MODE" };

/**
 * The tag of every `NetworkAction` member, keyed by the union's own
 * discriminant. The `Record` is the point: adding a member to `NetworkAction`
 * without an entry here fails to type-check, and an entry naming a tag the
 * union does not have fails too. A hand-written list of the same tags would
 * compile either way and leave the validator silently rejecting the new action.
 */
const NETWORK_ACTION_TYPE_FLAGS: Record<NetworkAction["type"], true> = {
  FIRE: true,
  USE_ITEM: true,
  INTERACT: true,
  SIGN_CLOSE: true,
  PICKUP: true,
  RELOAD: true,
  WAIT: true,
  DESCEND: true,
  ASCEND: true,
  SHAPE_TERRAIN: true,
  SPEAK: true,
  DIALOGUE_CHOICE: true,
  DIALOGUE_LEAVE: true,
  TOGGLE_GOD_MODE: true,
};

/** Every tag `isNetworkAction` accepts, in declaration order. */
export const NETWORK_ACTION_TYPES = Object.keys(
  NETWORK_ACTION_TYPE_FLAGS,
) as readonly NetworkAction["type"][];

const ACCEPTED_ACTION_TYPES = new Set<string>(NETWORK_ACTION_TYPES);

/**
 * Tag-level guard for an inbound `action` payload, applied by the server before
 * the action reaches any handler.
 *
 * This checks the discriminant only. Per-member payload fields are coerced
 * downstream, which is the open question ADR 0007 records; narrowing here would
 * pre-empt that decision.
 */
export function isNetworkAction(value: unknown): value is NetworkAction {
  if (typeof value !== "object" || value === null) return false;
  const { type } = value as { type?: unknown };
  return typeof type === "string" && ACCEPTED_ACTION_TYPES.has(type);
}
