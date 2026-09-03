import { describe, it, expect } from "vitest";
import { parseMultiplayerConfig } from "./multiplayer";

describe("parseMultiplayerConfig", () => {
  it("defaults everything for an empty query", () => {
    expect(parseMultiplayerConfig("")).toEqual({
      mode: "offline",
      serverUrl: "ws://localhost:7777",
      roomId: "default",
      playerName: "Player",
    });
  });

  it("reads all params", () => {
    const cfg = parseMultiplayerConfig(
      "?mode=online&server=ws://host:9&room=lobby&name=Kylir",
    );
    expect(cfg).toEqual({
      mode: "online",
      serverUrl: "ws://host:9",
      roomId: "lobby",
      playerName: "Kylir",
    });
  });

  it("falls back to offline for an unknown mode", () => {
    expect(parseMultiplayerConfig("?mode=banana").mode).toBe("offline");
  });

  it("ignores blank/whitespace param values", () => {
    const cfg = parseMultiplayerConfig("?room=%20%20&name=");
    expect(cfg.roomId).toBe("default");
    expect(cfg.playerName).toBe("Player");
  });

  it("handles invalid JSON strings gracefully", () => {
    const cfg = parseMultiplayerConfig('{"invalid":"json"}');
    expect(cfg).toEqual({
      mode: "offline",
      serverUrl: "ws://localhost:7777",
      roomId: "default",
      playerName: "Player",
    });
  });

  it("handles unexpected objects gracefully", () => {
    const cfg = parseMultiplayerConfig({ unexpected: "object" } as any);
    expect(cfg).toEqual({
      mode: "offline",
      serverUrl: "ws://localhost:7777",
      roomId: "default",
      playerName: "Player",
    });
  });

  it("handles null gracefully", () => {
    const cfg = parseMultiplayerConfig(null as any);
    expect(cfg.mode).toBe("offline");
  });

  it("throws on invalid array structures due to URLSearchParams", () => {
    expect(() => parseMultiplayerConfig(["invalid"] as any)).toThrow();
  });
});
