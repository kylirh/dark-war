/**
 * Shared multiplayer protocol constants.
 *
 * Imported by both the client (`src/net/multiplayer-client.ts`) and the
 * authoritative server (`server/multiplayer-server.ts`). Bump
 * PROTOCOL_VERSION whenever the wire format changes in a way that would
 * make an old client and new server (or vice versa) misinterpret messages.
 * The server stamps its version in the `welcome` message and clients refuse
 * to play on a mismatch rather than silently desyncing.
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
