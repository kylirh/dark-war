/** Durable room checkpoints: round-trip, absence, and refusal of foreign files. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Game } from "../src/engine/core/game";
import { PROTOCOL_VERSION } from "../src/net/protocol";
import { loadRoomCheckpoint, saveRoomCheckpoint } from "./room-checkpoint";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "dark-war-checkpoint-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** One real serialized world, so the round-trip carries production shapes. */
function world(): ReturnType<Game["serialize"]> {
  const game = new Game({ mode: "online", worldSeed: 42 });
  game.reset(0);
  return game.serialize();
}

function writeRaw(roomId: string, contents: unknown): void {
  writeFileSync(join(directory, `${roomId}.json`), JSON.stringify(contents));
}

describe("room checkpoints", () => {
  it("round-trips a saved room", () => {
    const saved = { seed: 1234, worlds: [world()] };
    saveRoomCheckpoint(directory, "garden", saved);

    const loaded = loadRoomCheckpoint(directory, "garden");
    expect(loaded?.seed).toBe(1234);
    expect(loaded?.worlds).toHaveLength(1);
    expect(loaded?.worlds[0].plane).toEqual(saved.worlds[0].plane);
  });

  it("stamps the current protocol version on disk", () => {
    saveRoomCheckpoint(directory, "garden", { seed: 7, worlds: [] });

    const raw = JSON.parse(
      readFileSync(join(directory, "garden.json"), "utf8"),
    ) as { version: number };
    expect(raw.version).toBe(PROTOCOL_VERSION);
  });

  it("creates the save directory on demand", () => {
    const nested = join(directory, "deeper", "still");
    saveRoomCheckpoint(nested, "garden", { seed: 7, worlds: [] });
    expect(loadRoomCheckpoint(nested, "garden")?.seed).toBe(7);
  });

  it("reports an unseen room as absent rather than failing", () => {
    expect(loadRoomCheckpoint(directory, "never-played")).toBeUndefined();
  });

  it("keeps rooms in separate files", () => {
    saveRoomCheckpoint(directory, "garden", { seed: 1, worlds: [] });
    saveRoomCheckpoint(directory, "orchard", { seed: 2, worlds: [] });

    expect(loadRoomCheckpoint(directory, "garden")?.seed).toBe(1);
    expect(loadRoomCheckpoint(directory, "orchard")?.seed).toBe(2);
  });

  it("replaces an earlier checkpoint for the same room", () => {
    saveRoomCheckpoint(directory, "garden", { seed: 1, worlds: [] });
    saveRoomCheckpoint(directory, "garden", { seed: 2, worlds: [] });

    expect(loadRoomCheckpoint(directory, "garden")?.seed).toBe(2);
  });

  // Dark War is unreleased and carries no compatibility shims, so a checkpoint
  // from another protocol version must be refused, not partially adopted.
  it("refuses a checkpoint from a different protocol version", () => {
    writeRaw("garden", {
      version: PROTOCOL_VERSION - 1,
      seed: 1,
      worlds: [],
    });

    expect(() => loadRoomCheckpoint(directory, "garden")).toThrow(
      /Unsupported Dark War room checkpoint for garden/,
    );
  });

  it.each([
    { label: "an absent version", contents: { seed: 1, worlds: [] } },
    {
      label: "a non-integer seed",
      contents: { version: PROTOCOL_VERSION, seed: 1.5, worlds: [] },
    },
    {
      label: "an absent seed",
      contents: { version: PROTOCOL_VERSION, worlds: [] },
    },
    {
      label: "worlds that are not an array",
      contents: { version: PROTOCOL_VERSION, seed: 1, worlds: {} },
    },
  ])("refuses a checkpoint with $label", ({ contents }) => {
    writeRaw("garden", contents);

    expect(() => loadRoomCheckpoint(directory, "garden")).toThrow(
      /Unsupported Dark War room checkpoint for garden/,
    );
  });

  it("surfaces an unreadable file rather than reporting it as absent", () => {
    writeFileSync(join(directory, "garden.json"), "{not json");

    expect(() => loadRoomCheckpoint(directory, "garden")).toThrow();
    expect(loadRoomCheckpoint(directory, "other")).toBeUndefined();
  });
});
