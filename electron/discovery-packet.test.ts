import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// discovery-packet.js is CommonJS because the Electron main process requires it
// directly; pull it in the same way rather than relying on ESM interop.
const { APP_ID, parseDiscoveryPacket } = createRequire(import.meta.url)(
  "./discovery-packet.js",
);

type Parsed = {
  ip: string;
  port: number;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: string;
} | null;

/** Build a datagram the way a broadcasting host would. */
function packet(fields: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify({ app: APP_ID, ...fields }), "utf8");
}

function parse(fields: Record<string, unknown>, ip = "10.0.0.5"): Parsed {
  return parseDiscoveryPacket(packet(fields), ip);
}

const VALID = { wsPort: 7777, name: "Base Camp", host: "kylir", players: 2 };

describe("parseDiscoveryPacket", () => {
  it("accepts a well-formed packet", () => {
    expect(parse(VALID)).toEqual({
      ip: "10.0.0.5",
      port: 7777,
      name: "Base Camp",
      host: "kylir",
      players: 2,
      maxPlayers: 4,
      phase: "lobby",
    });
  });

  it("takes the address from rinfo, never from the payload", () => {
    const parsed = parse({ ...VALID, ip: "evil.example.com" }, "192.168.1.9");
    expect(parsed?.ip).toBe("192.168.1.9");
  });

  it("rejects malformed JSON, foreign apps, and non-objects", () => {
    expect(parseDiscoveryPacket(Buffer.from("not json"), "1.1.1.1")).toBeNull();
    expect(parseDiscoveryPacket(Buffer.from("null"), "1.1.1.1")).toBeNull();
    expect(
      parseDiscoveryPacket(Buffer.from('"a string"'), "1.1.1.1"),
    ).toBeNull();
    expect(
      parseDiscoveryPacket(
        Buffer.from(JSON.stringify({ app: "not-dark-war", wsPort: 7777 })),
        "1.1.1.1",
      ),
    ).toBeNull();
  });

  it("rejects packets whose port could not be dialled", () => {
    for (const wsPort of [0, -1, 65536, "80/evil", null, undefined, NaN, {}]) {
      expect(parse({ ...VALID, wsPort })).toBeNull();
    }
  });

  it("whitelists phase so only known values reach the UI", () => {
    expect(parse({ ...VALID, phase: "playing" })?.phase).toBe("playing");
    expect(parse({ ...VALID, phase: "lobby" })?.phase).toBe("lobby");
    for (const phase of ["<img src=x onerror=alert(1)>", "", 7, null, {}]) {
      expect(parse({ ...VALID, phase })?.phase).toBe("lobby");
    }
  });

  it("coerces counts to integers inside a sane range", () => {
    expect(parse({ ...VALID, players: "3" })?.players).toBe(3);
    expect(parse({ ...VALID, players: 2.9 })?.players).toBe(2);
    // Out of range or not a number at all falls back to the defaults.
    expect(parse({ ...VALID, players: -1 })?.players).toBe(0);
    expect(parse({ ...VALID, players: 1e9 })?.players).toBe(0);
    expect(parse({ ...VALID, players: "abc" })?.players).toBe(0);
    expect(parse({ ...VALID, maxPlayers: 8 })?.maxPlayers).toBe(8);
    expect(parse({ ...VALID, maxPlayers: 0 })?.maxPlayers).toBe(4);
    expect(parse({ ...VALID, maxPlayers: "abc" })?.maxPlayers).toBe(4);
  });

  it("always yields strings for the display fields", () => {
    // The renderer calls escapeHtml on these; a non-string would throw and
    // blank the whole server list.
    for (const value of [123, null, undefined, {}, [], true]) {
      const parsed = parse({ ...VALID, name: value, host: value });
      expect(typeof parsed?.name).toBe("string");
      expect(typeof parsed?.host).toBe("string");
    }
    expect(parse({ ...VALID, name: "   " })?.name).toBe("Dark War Server");
  });

  it("strips control characters and bounds the length of display text", () => {
    const parsed = parse({
      ...VALID,
      name: "line one\u0000\nline\u007ftwo",
      host: "h".repeat(500),
    });
    expect(parsed?.name).toBe("line one  line two");
    expect(parsed?.host).toHaveLength(48);
  });

  it("passes markup through untouched for the renderer to escape", () => {
    // Escaping is the template's job — doing it here would corrupt legitimate
    // names and double-escape once the renderer runs escapeHtml.
    const name = "<b>Camp</b> & Co";
    expect(parse({ ...VALID, name })?.name).toBe(name);
  });
});
