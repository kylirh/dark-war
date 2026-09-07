import { describe, it, expect, beforeEach } from "vitest";
import { PlayerEntity } from "../../entities/player-entity";
import { Game } from "../../core/game";
import { EventType, ItemType } from "../../types";
import { SoundEffect } from "../../content/sound-effects";
import { RNG } from "../../utils/rng";
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
