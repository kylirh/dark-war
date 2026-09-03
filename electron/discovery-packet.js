/**
 * Dark War LAN Multiplayer — Discovery Packet Parsing
 *
 * LAN discovery packets arrive as unauthenticated UDP broadcasts, so anyone on
 * the network can send anything at all. The parsed fields cross IPC into the
 * renderer, which interpolates them into `innerHTML` for the server browser —
 * that makes this the security boundary. Every field is coerced, bounded, and
 * whitelisted here so the renderer only ever sees a well-formed record.
 *
 * Pure and dependency-free so it can be unit tested outside Electron.
 */

const APP_ID = "dark-war-v1";

const MAX_TEXT_LENGTH = 48;
const MAX_PLAYER_COUNT = 64;
const DEFAULT_MAX_PLAYERS = 4;
const PHASES = ["lobby", "playing"];

/**
 * Coerce an untrusted value to a short, single-line display string. Control
 * characters become spaces so a packet cannot smuggle newlines or NULs into the
 * UI, and the result is length-bounded so it cannot blow out the layout.
 */
function toDisplayText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, MAX_TEXT_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Coerce an untrusted value to an integer within [min, max], or `fallback`. */
function toBoundedInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i < min || i > max ? fallback : i;
}

/**
 * Parse one UDP discovery datagram into a `DiscoveredServer`, or `null` if the
 * packet is malformed, is not ours, or advertises an unusable port.
 *
 * @param {Buffer|Uint8Array|string} buf raw datagram payload
 * @param {string} ip sender address, taken from `rinfo` rather than the payload
 * @returns {{ip: string, port: number, name: string, host: string,
 *            players: number, maxPlayers: number, phase: string} | null}
 */
function parseDiscoveryPacket(buf, ip) {
  let msg;
  try {
    msg = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object") return null;
  if (msg.app !== APP_ID) return null;

  // A server we cannot dial is not worth listing — the port later builds the
  // `ws://` URL, so reject anything outside the valid range outright.
  const port = toBoundedInt(msg.wsPort, 1, 65535, 0);
  if (port === 0) return null;

  return {
    ip,
    port,
    name: toDisplayText(msg.name, "Dark War Server"),
    host: toDisplayText(msg.host, "Unknown"),
    players: toBoundedInt(msg.players, 0, MAX_PLAYER_COUNT, 0),
    maxPlayers: toBoundedInt(
      msg.maxPlayers,
      1,
      MAX_PLAYER_COUNT,
      DEFAULT_MAX_PLAYERS,
    ),
    phase: PHASES.includes(msg.phase) ? msg.phase : "lobby",
  };
}

module.exports = { APP_ID, parseDiscoveryPacket };
