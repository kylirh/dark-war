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

/** Validate action fields before an untrusted payload reaches a handler. */
export function isNetworkAction(value: unknown): value is NetworkAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const action = value as Record<string, unknown>;
  const finite = (key: string): boolean =>
    typeof action[key] === "number" && Number.isFinite(action[key]);
  const optionalFinite = (key: string): boolean =>
    action[key] === undefined || finite(key);
  const revision = (): boolean =>
    finite("expectedRevision") &&
    Number.isSafeInteger(action.expectedRevision) &&
    (action.expectedRevision as number) >= 0;
  const validators = {
    FIRE: (): boolean =>
      finite("dx") &&
      finite("dy") &&
      optionalFinite("facingAngle") &&
      optionalFinite("targetWorldX") &&
      optionalFinite("targetWorldY"),
    USE_ITEM: (): boolean =>
      finite("dx") &&
      finite("dy") &&
      optionalFinite("facingAngle") &&
      optionalFinite("targetWorldX") &&
      optionalFinite("targetWorldY"),
    INTERACT: (): boolean => finite("dx") && finite("dy"),
    SIGN_CLOSE: (): boolean => true,
    PICKUP: (): boolean => true,
    RELOAD: (): boolean => true,
    WAIT: (): boolean => true,
    DESCEND: (): boolean => true,
    ASCEND: (): boolean => true,
    SHAPE_TERRAIN: (): boolean =>
      Number.isSafeInteger(action.tileX) &&
      Number.isSafeInteger(action.tileY) &&
      (action.delta === -1 || action.delta === 1),
    SPEAK: (): boolean =>
      (action.kind === "speech" || action.kind === "thought") &&
      typeof action.text === "string",
    DIALOGUE_CHOICE: (): boolean =>
      typeof action.choiceId === "string" &&
      (action.freeText === undefined || typeof action.freeText === "string") &&
      revision(),
    DIALOGUE_LEAVE: revision,
    TOGGLE_GOD_MODE: (): boolean => true,
  } satisfies Record<NetworkAction["type"], () => boolean>;
  return (
    typeof action.type === "string" &&
    Object.prototype.hasOwnProperty.call(validators, action.type) &&
    validators[action.type as NetworkAction["type"]]()
  );
}
