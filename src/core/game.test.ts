import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import { EntityKind, TileType, WeaponType } from "../types";
import { RNG } from "../utils/rng";

describe("Game serialize/deserialize round-trip", () => {
  beforeEach(() => RNG.reseed(424242));

  it("restores depth, map, player, and entities", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1); // a dungeon level

    const before = game.getState();
    const serialized = game.serialize();

    const restored = new Game({ mode: "offline" });
    restored.deserialize(serialized);
    const after = restored.getState();

    expect(after.depth).toBe(before.depth);
    expect(after.map).toEqual(before.map);
    expect(after.mapWidth).toBe(before.mapWidth);
    expect(after.mapHeight).toBe(before.mapHeight);
    expect(after.player.gridX).toBe(before.player.gridX);
    expect(after.player.gridY).toBe(before.player.gridY);
    expect(after.entities.length).toBe(before.entities.length);
  });

  it("rebuilds the tile source over the restored map", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const state = restored.getState();
    // tiles must reflect the restored map, not a stale array.
    expect(state.tiles.width).toBe(state.mapWidth);
    expect(state.tiles.getTile(state.player.gridX, state.player.gridY)).toBe(
      state.map[state.player.gridX + state.player.gridY * state.mapWidth],
    );
  });

  it("serializes independent map/wallDamage arrays so deltas can detect changes", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);

    const before = game.serialize();
    // Damage a wall and crack a tile after the first snapshot.
    game.getState().map[10] = TileType.HOLE;
    game.getState().wallDamage[10] = 5;
    const after = game.serialize();

    // Distinct arrays (not shared references) so a delta baseline sees the diff.
    expect(after.map).not.toBe(before.map);
    expect(after.wallDamage).not.toBe(before.wallDamage);
    expect(before.map[10]).not.toBe(after.map[10]);
    expect(before.wallDamage![10]).not.toBe(after.wallDamage![10]);
  });

  it("keeps the player present in the entities list", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const players = state.entities.filter((e) => e.kind === EntityKind.PLAYER);
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe(state.player.id);
  });
});

describe("Game multiplayer player management", () => {
  beforeEach(() => RNG.reseed(7));

  it("adds and removes network players", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const startCount = game.getState().players.length;

    game.addNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(true);
    expect(game.getState().players.length).toBe(startCount + 1);

    game.removeNetworkPlayer("remote-1");
    expect(game.getState().players.some((p) => p.id === "remote-1")).toBe(false);
    expect(game.getState().entities.some((e) => e.id === "remote-1")).toBe(false);
  });

  it("suppresses a shooter's own shoot-sound echo but not for other players", () => {
    const game = new Game({ mode: "online" });
    game.reset(1);
    game.addNetworkPlayer("p1");
    game.addNetworkPlayer("p2");
    // SoundEffect.SHOOT === "gyrojet-pistol"; p1 fired (predicts it locally).
    game.getState().pendingSounds.push({ effect: "gyrojet-pistol", sourceId: "p1" });

    expect(game.serializeForPlayer("p1").sounds).not.toContain("gyrojet-pistol");
    expect(game.serializeForPlayer("p2").sounds).toContain("gyrojet-pistol");
  });

  it("does not spawn the CTDM item in online mode", () => {
    const online = new Game({ mode: "online" });
    online.reset(0); // outside level (where the CTDM normally is)
    const hasCtdm = online
      .getState()
      .entities.some((e) => (e as { type?: string }).type === "CTDM");
    expect(hasCtdm).toBe(false);
  });

  it("detaches a player and re-attaches it to another world with stats intact", () => {
    const from = new Game({ mode: "online" });
    from.reset(1);
    const to = new Game({ mode: "online" });
    to.reset(2);

    const player = from.addNetworkPlayer("traveler");
    player.hp = 37;
    player.weapon = WeaponType.PISTOL;

    const detached = from.detachPlayer("traveler");
    expect(detached).toBe(player);
    expect(from.getState().players.some((p) => p.id === "traveler")).toBe(false);
    expect(from.getState().entities.some((e) => e.id === "traveler")).toBe(false);

    to.attachExistingPlayer(detached!, to.getState().stairsUp ?? [1, 1]);
    const moved = to.getState().players.find((p) => p.id === "traveler");
    expect(moved).toBeDefined();
    expect(moved!.hp).toBe(37); // stats carried over
    expect(moved!.weapon).toBe(WeaponType.PISTOL);
    expect(to.getState().entities.some((e) => e.id === "traveler")).toBe(true);
  });
});
