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
export const PROTOCOL_VERSION = 3;
