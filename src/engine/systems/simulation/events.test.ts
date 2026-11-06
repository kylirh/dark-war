import { describe, it, expect, beforeEach } from "vitest";
import { PlayerEntity } from "../../entities/player-entity";
import { Game } from "../../core/game";
import { EventType, ItemType, TileType } from "../../types";
import { SoundEffect } from "../../content/sound-effects";
import { RNG } from "../../utils/rng";
import { idxFor } from "../../utils/helpers";
import { MAX_EVENTS_PER_TICK } from "./constants";
import { grantCoreDevice, processEventQueue } from "./events";

describe("processEventQueue", () => {
  it("halts execution and splices the queue when MAX_EVENTS_PER_TICK is exceeded", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const originalLength = MAX_EVENTS_PER_TICK + 10;

    // Fill the queue past the limit
    for (let i = 0; i < originalLength; i++) {
      state.eventQueue.push({
        id: `evt-${i}`,
        depth: state.depth,
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "test event" },
      });
    }

    expect(state.eventQueue.length).toBe(originalLength);

    processEventQueue(state);

    // After processing, the processed events should be removed (spliced away).
    // The unprocessed events should remain in the queue.
    expect(state.eventQueue.length).toBe(
      originalLength - (MAX_EVENTS_PER_TICK + 1),
    );
  });

  // The simulation path must draw every random choice from the seeded RNG,
  // including cosmetic ones: `pendingSounds` is serialized into
  // `SerializedState.sounds`, so a `Math.random` pick makes the same seed
  // replay to a different observable state.
  it("picks damage sounds from the seeded rng, so one seed replays identically", () => {
    const PLAYER_HIT_SOUNDS = new Set<string>([
      SoundEffect.PLAYER_HIT_1,
      SoundEffect.PLAYER_HIT_2,
      SoundEffect.PLAYER_HIT_3,
      SoundEffect.PLAYER_HIT_4,
      SoundEffect.PLAYER_HIT_5,
    ]);

    // 16 draws over 5 sounds: an unseeded picker matching by luck is ~1e-11.
    const HIT_COUNT = 16;

    const replayHitSounds = (seed: number): string[] => {
      const game = new Game({ mode: "offline" });
      game.reset(1);
      const state = game.getState();
      RNG.reseed(seed);
      state.pendingSounds.length = 0;

      for (let i = 0; i < HIT_COUNT; i++) {
        // Keep the player alive so every iteration takes the damage path.
        state.player.hp = state.player.hpMax;
        state.eventQueue.push({
          id: `damage-${i}`,
          depth: state.depth,
          type: EventType.DAMAGE,
          data: { type: "DAMAGE", targetId: state.player.id, amount: 1 },
        });
        processEventQueue(state);
      }

      return state.pendingSounds
        .map((sound) => sound.effect)
        .filter((effect) => PLAYER_HIT_SOUNDS.has(effect));
    };

    const first = replayHitSounds(0x5eed1234);
    const second = replayHitSounds(0x5eed1234);

    expect(first).toHaveLength(HIT_COUNT);
    expect(second).toEqual(first);
  });

  it("does not repeat the newest story message", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.story.length = 0;
    state.eventQueue.push(
      {
        id: "message-1",
        depth: state.depth,
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "Repeated event" },
      },
      {
        id: "message-2",
        depth: state.depth,
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "Repeated event" },
      },
    );

    processEventQueue(state);

    expect(state.story).toEqual(["Repeated event"]);
  });
});

// `processDoorOpenEvent` toggles a door and records the tile index on
// `state.changedTiles`, which is what `Physics.syncEntityBodies` consumes to
// reconcile the collider for that cell. The tracking used to be copy/pasted
// into both branches; it now runs once after them, guarded by an
// `else { return; }` so a non-door tile is not reported as changed. The
// function had no test before that consolidation, so these pin the behaviour
// the refactor is required to preserve — the suite was previously green either
// way.
describe("processDoorOpenEvent", () => {
  beforeEach(() => RNG.reseed(1));

  /** Fire a DOOR_OPEN event at a tile and drain the queue. */
  const toggleDoor = (
    state: ReturnType<Game["getState"]>,
    x: number,
    y: number,
  ): void => {
    state.eventQueue.push({
      id: "evt-door",
      depth: state.depth,
      type: EventType.DOOR_OPEN,
      data: { type: "DOOR_OPEN", x, y },
    });
    processEventQueue(state);
  };

  /** A game whose tile at (x, y) is `tile`, with change tracking cleared. */
  const gameWithTile = (
    tile: TileType,
  ): { state: ReturnType<Game["getState"]>; x: number; y: number } => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const x = state.player.gridX + 1;
    const y = state.player.gridY;
    state.tiles.setTile(x, y, tile);
    state.changedTiles = new Set<number>();
    state.pendingSounds.length = 0;
    return { state, x, y };
  };

  it("opens a closed door and reports the tile as changed", () => {
    const { state, x, y } = gameWithTile(TileType.DOOR_CLOSED);

    toggleDoor(state, x, y);

    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_OPEN);
    expect(state.changedTiles?.has(idxFor(x, y, state.mapWidth))).toBe(true);
    expect(state.pendingSounds.map((sound) => sound.effect)).toContain(
      SoundEffect.DOOR_OPEN,
    );
  });

  it("opens a locked door, sharing the closed-door branch", () => {
    const { state, x, y } = gameWithTile(TileType.DOOR_LOCKED);

    toggleDoor(state, x, y);

    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_OPEN);
    expect(state.changedTiles?.has(idxFor(x, y, state.mapWidth))).toBe(true);
  });

  it("closes an open door and reports the tile as changed", () => {
    const { state, x, y } = gameWithTile(TileType.DOOR_OPEN);

    toggleDoor(state, x, y);

    expect(state.tiles.getTile(x, y)).toBe(TileType.DOOR_CLOSED);
    expect(state.changedTiles?.has(idxFor(x, y, state.mapWidth))).toBe(true);
    expect(state.pendingSounds.map((sound) => sound.effect)).toContain(
      SoundEffect.DOOR_CLOSE,
    );
  });

  // The assertion the consolidation actually needs: with the tracking hoisted
  // out of the branches, a tile that is not a door must still be left out of
  // `changedTiles`. Dropping the `else { return; }` would queue a pointless
  // collider rebuild for every stray DOOR_OPEN event and this is the only
  // thing that would notice.
  it("leaves a non-door tile untouched and unreported", () => {
    const { state, x, y } = gameWithTile(TileType.FLOOR);

    toggleDoor(state, x, y);

    expect(state.tiles.getTile(x, y)).toBe(TileType.FLOOR);
    expect(state.changedTiles?.has(idxFor(x, y, state.mapWidth))).toBe(false);
    expect(state.pendingSounds).toHaveLength(0);
  });
});

describe("grantCoreDevice", () => {
  let player: PlayerEntity;

  beforeEach(() => {
    player = new PlayerEntity(0, 0);
  });

  it("grants CTDM if player doesn't have it", () => {
    expect(player.hasCTDM).toBe(false);
    expect(player.ctdmEnabled).toBe(false);

    const result = grantCoreDevice(player, ItemType.CTDM);

    expect(result).toBe(true);
    expect(player.hasCTDM).toBe(true);
    expect(player.ctdmEnabled).toBe(true);
    expect(player.inventorySlots.some((s) => s?.type === ItemType.CTDM)).toBe(
      true,
    );
  });

  it("does not grant CTDM if player already has it", () => {
    player.hasCTDM = true;
    player.ctdmEnabled = true;

    const result = grantCoreDevice(player, ItemType.CTDM);

    expect(result).toBe(false);
    expect(player.hasCTDM).toBe(true); // Should remain true
    // Inventory shouldn't have another CTDM added
    expect(
      player.inventorySlots.filter((s) => s?.type === ItemType.CTDM).length,
    ).toBe(0);
  });

  it("grants Matter Manipulator if player doesn't have it", () => {
    expect(player.hasMatterManipulator).toBe(false);

    const result = grantCoreDevice(player, ItemType.MATTER_MANIPULATOR);

    expect(result).toBe(true);
    expect(player.hasMatterManipulator).toBe(true);
    expect(
      player.inventorySlots.some(
        (s) => s?.type === ItemType.MATTER_MANIPULATOR,
      ),
    ).toBe(true);
  });

  it("does not grant Matter Manipulator if player already has it", () => {
    player.hasMatterManipulator = true;

    const result = grantCoreDevice(player, ItemType.MATTER_MANIPULATOR);

    expect(result).toBe(false);
    expect(player.hasMatterManipulator).toBe(true); // Should remain true
    // Inventory shouldn't have another Matter Manipulator added
    expect(
      player.inventorySlots.filter(
        (s) => s?.type === ItemType.MATTER_MANIPULATOR,
      ).length,
    ).toBe(0);
  });

  it("returns false for non-core devices", () => {
    const result = grantCoreDevice(player, ItemType.PISTOL);
    expect(result).toBe(false);
  });
});

describe("Damage mitigation", () => {
  it("sub-1 attacks against armored players are not mitigated to 1", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.hp = 10;
    (player as any).armor = 5;

    state.eventQueue.push({
      id: "test-damage",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: { type: "DAMAGE", targetId: player.id, amount: 0.5 },
    });

    processEventQueue(state);

    expect(player.hp).toBe(9.5);
  });
});
