import { describe, it, expect, beforeEach } from "vitest";
import { PlayerEntity } from "../../entities/player-entity";
import { Game } from "../../core/game";
import { EventType, ItemType } from "../../types";
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
