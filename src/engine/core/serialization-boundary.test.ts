import { describe, it, expect } from "vitest";
import { Game } from "./game";
import { ItemType } from "../types";

/**
 * Foundation A regressions: the serialization boundary must not alias live
 * state (a delta baseline aliasing live nested objects would silently drop
 * changes), and the durable simulation seed must survive save/load.
 */
describe("serialization boundary", () => {
  it("does not alias live nested entity state", () => {
    const game = new Game({ mode: "offline" });
    const snapshotBefore = game.serialize();

    // Mutate the live player's nested itemCounts in place.
    const livePlayer = game.getState().player as unknown as {
      itemCounts: Partial<Record<ItemType, number>>;
    };
    const before = livePlayer.itemCounts[ItemType.COOKIE] ?? 0;
    livePlayer.itemCounts[ItemType.COOKIE] = before + 5;

    const snapshotAfter = game.serialize();

    // The earlier snapshot must NOT reflect the later mutation (no aliasing).
    expect(snapshotBefore.player.itemCounts[ItemType.COOKIE] ?? 0).toBe(before);
    // The later snapshot must reflect it (serialize reads live state each call).
    expect(snapshotAfter.player.itemCounts[ItemType.COOKIE]).toBe(before + 5);
    // The serialized nested object is a distinct reference from live state.
    expect(snapshotBefore.player.itemCounts).not.toBe(livePlayer.itemCounts);
  });

  it("persists the simulation seed across serialize/deserialize", () => {
    const game = new Game({ mode: "offline" });
    const seed = game.getState().simulationSeed;
    expect(typeof seed).toBe("number");

    const serialized = game.serialize();
    expect(serialized.simulationSeed).toBe(seed);

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    expect(restored.getState().simulationSeed).toBe(seed);
  });

  it("gives a stable seed across repeated serialization", () => {
    const game = new Game({ mode: "offline" });
    expect(game.serialize().simulationSeed).toBe(
      game.serialize().simulationSeed,
    );
  });
});
