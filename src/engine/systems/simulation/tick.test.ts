import { describe, it, expect, vi } from "vitest";
import { stepSimulationTick } from "./tick";
import { Game } from "../../core/game";
import { MAX_COMMANDS_PER_TICK } from "./constants";
import * as ai from "./ai";
import {
  CELL_CONFIG,
  type GameState,
  ItemType,
  MonsterType,
  TileType,
} from "../../types";
import { ItemEntity } from "../../entities/item-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import { RNG } from "../../utils/rng";
import { idxFor } from "../../utils/helpers";
import { processEventQueue } from "./events";

vi.mock("./ai", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    generateAICommands: vi.fn(),
  };
});

describe("stepSimulationTick", () => {
  it("truncates aiCommands when they exceed MAX_COMMANDS_PER_TICK", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const tick = 10;
    state.sim.nowTick = tick;

    const overflow = 5;
    const mockCommands: any[] = [];
    for (let i = 0; i < MAX_COMMANDS_PER_TICK + overflow; i++) {
      mockCommands.push({
        id: `cmd-${i}`,
        type: "WAIT",
        actorId: `m${i}`,
        tick,
      });
    }

    (ai.generateAICommands as any).mockReturnValue(mockCommands);
    // The guard logs the pre-truncation count. Spying both asserts that it
    // fired and keeps the expected error off the suite's stderr.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      stepSimulationTick(state);

      // The guard is observable in two ways, and both matter. The log is what
      // an operator sees when AI generation runs away.
      expect(errorSpy).toHaveBeenCalledWith(
        `Too many AI commands for tick ${tick}: ${MAX_COMMANDS_PER_TICK + overflow}`,
      );
      // The cap itself. Note this asserts on the caller's array because the
      // guard truncates in place (`aiCommands.length = MAX_COMMANDS_PER_TICK`);
      // a future non-mutating rewrite would need this assertion updated.
      expect(mockCommands.length).toBe(MAX_COMMANDS_PER_TICK);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("leaves aiCommands alone when they are within the limit", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const tick = 11;
    state.sim.nowTick = tick;

    const mockCommands: any[] = [
      { id: "cmd-0", type: "WAIT", actorId: "m0", tick },
    ];
    (ai.generateAICommands as any).mockReturnValue(mockCommands);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      stepSimulationTick(state);

      // Without this, a guard that truncated unconditionally would still pass.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(mockCommands.length).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  describe("processMagneticPickup", () => {
    it("pushes a PICKUP_ITEM event (processed in the same tick) when within collect radius", () => {
      const game = new Game({ mode: "offline" });
      game.reset(1);
      const state = game.getState();

      const player = state.players[0];
      player.worldX = 50;
      player.worldY = 50;
      player.itemCounts = {}; // Reset inventory

      // Clear existing items that might have spawned in reset()
      const existingItems = [...state.entityManager.items];
      for (const item of existingItems) {
        state.entityManager.destroy(item.id);
      }

      // Position item exactly at MAGNET_COLLECT_RADIUS distance
      const item = new ItemEntity(0, 0, ItemType.MEDKIT);
      item.worldX = 70; // 50 + 20
      item.worldY = 50;
      state.entityManager.spawn(item);

      (ai.generateAICommands as any).mockReturnValue([]);

      expect(player.itemCounts[ItemType.MEDKIT] || 0).toBe(0);
      expect(state.entityManager.items.length).toBe(1);

      stepSimulationTick(state);

      // The pickup event should be emitted and processed during this tick's processEventQueue.
      expect(player.itemCounts[ItemType.MEDKIT]).toBe(1);
      // The item is destroyed after collection.
      expect(state.entityManager.items.length).toBe(0);
    });
  });

  it("ignores items that are machines", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();

    const player = state.players[0];
    player.worldX = 50;
    player.worldY = 50;

    // Clear existing items
    const existingItems = [...state.entityManager.items];
    for (const item of existingItems) {
      state.entityManager.destroy(item.id);
    }

    const machine = new ItemEntity(0, 0, ItemType.VENDING_MACHINE);
    machine.worldX = 70;
    machine.worldY = 50;
    machine.prevWorldX = 70;
    machine.prevWorldY = 50;
    state.entityManager.spawn(machine);

    (ai.generateAICommands as any).mockReturnValue([]);

    stepSimulationTick(state);

    expect(state.entityManager.items.length).toBe(1);
    expect(state.entityManager.items[0].worldX).toBe(70); // Did not move
  });

  it("drifts items toward the player before collecting them", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();

    const player = state.players[0];
    player.worldX = 50;
    player.worldY = 50;

    // Clear existing items
    const existingItems = [...state.entityManager.items];
    for (const item of existingItems) {
      state.entityManager.destroy(item.id);
    }

    // MAGNET_RADIUS is 72, MAGNET_COLLECT_RADIUS is 20, MAGNET_PULL_PX is 7
    const item = new ItemEntity(0, 0, ItemType.MEDKIT);
    item.worldX = 90; // 50 + 40
    item.worldY = 50;
    item.prevWorldX = 90;
    item.prevWorldY = 50;
    state.entityManager.spawn(item);

    (ai.generateAICommands as any).mockReturnValue([]);

    stepSimulationTick(state);

    expect(state.entityManager.items.length).toBe(1);
    // Distance is 40. Should move 7px toward player.
    expect(state.entityManager.items[0].worldX).toBeCloseTo(83);
  });

  it("drifts items toward the player across the toroidal seam on the outside level", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();

    state.levelKind = "outside";

    const player = state.players[0];
    const worldW = state.mapWidth * CELL_CONFIG.w;
    player.worldX = worldW - 10;
    player.worldY = 50;

    // Clear existing items
    const existingItems = [...state.entityManager.items];
    for (const item of existingItems) {
      state.entityManager.destroy(item.id);
    }

    const item = new ItemEntity(0, 0, ItemType.MEDKIT);
    item.worldX = 30; // distance is 40 across the seam
    item.worldY = 50;
    item.prevWorldX = 30;
    item.prevWorldY = 50;
    state.entityManager.spawn(item);

    (ai.generateAICommands as any).mockReturnValue([]);

    stepSimulationTick(state);

    expect(state.entityManager.items.length).toBe(1);
    const newX = state.entityManager.items[0].worldX;
    // Should move 7px towards player (LEFT across the seam, decreasing X).
    // So newX should be 23.
    expect(newX).toBeCloseTo(23);
  });

  describe("processHoleFalls", () => {
    // A 50% per-tick fall chance only shows up in bulk, so both monster cases
    // run the same number of trials and assert against this one constant.
    const FALL_TRIALS = 100;

    function setupHoleTest(mode: "offline" | "online" = "offline") {
      const game = new Game({ mode });
      game.reset(1);
      const state = game.getState();
      const holeX = 5;
      const holeY = 5;

      const existingItems = [...state.entityManager.items];
      for (const item of existingItems) {
        state.entityManager.destroy(item.id);
      }
      state.tiles.setTile(holeX, holeY, TileType.HOLE);

      (ai.generateAICommands as any).mockReturnValue([]);

      return { state, holeX, holeY };
    }

    function runFallTrials(
      state: GameState,
      hx: number,
      hy: number,
      isMoving: boolean,
    ): number {
      let fallCount = 0;
      for (let i = 0; i < FALL_TRIALS; i++) {
        const monster = new MonsterEntity(hx, hy, MonsterType.MUTANT, 1);
        monster.prevWorldX = isMoving
          ? (hx - 1) * CELL_CONFIG.w
          : monster.worldX;
        monster.prevWorldY = isMoving ? hy * CELL_CONFIG.h : monster.worldY;
        state.entityManager.spawn(monster);

        stepSimulationTick(state);
        processEventQueue(state);

        const exists = state.entities.some((e) => e.id === monster.id);
        if (!exists) fallCount++;
        else state.entityManager.destroy(monster.id);
      }
      return fallCount;
    }

    it("prevents players from falling through holes during online multiplayer", () => {
      // Online, the server owns player hole-falls — it migrates the individual
      // player between per-depth worlds. Running the fall here too would warp
      // the whole party and apply HOLE_FALL_DAMAGE twice.
      const game = new Game({ mode: "online" });
      game.reset(1);
      const state = game.getState();
      const player = state.player;

      state.holeCreatedTiles = new Set([
        idxFor(player.gridX, player.gridY, state.mapWidth),
      ]);

      (ai.generateAICommands as any).mockReturnValue([]);

      const hpBefore = player.hp;

      stepSimulationTick(state);

      expect(state.shouldDescend).toBe(false);
      // The damage assertion has to be on the player, not on `eventQueue`:
      // `stepSimulationTick` drains the queue immediately after
      // `processHoleFalls`, so a queue assertion passes no matter what.
      expect(player.hp).toBe(hpBefore);
    });

    it("pushes items falling through holes into itemsFellThrough and destroys them offline", () => {
      const { state, holeX, holeY } = setupHoleTest("offline");

      const item1 = new ItemEntity(holeX, holeY, ItemType.MEDKIT);
      const item2 = new ItemEntity(holeX, holeY, ItemType.AMMO);
      item2.amount = 10;

      state.entityManager.spawn(item1);
      state.entityManager.spawn(item2);

      expect(state.entityManager.items.length).toBe(2);
      expect(state.itemsFellThrough).toBeUndefined();

      stepSimulationTick(state);

      expect(state.entityManager.items.length).toBe(0);
      expect(state.itemsFellThrough).toBeDefined();
      expect(state.itemsFellThrough!.length).toBe(2);
      expect(state.itemsFellThrough).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: ItemType.MEDKIT }),
          expect.objectContaining({ type: ItemType.AMMO, amount: 10 }),
        ]),
      );
    });

    it("destroys items falling through holes but does not populate itemsFellThrough online", () => {
      // The constructor mode is what `state.multiplayer.mode` is built from, so
      // driving the branch through it also pins that wiring. Overwriting
      // `state.multiplayer` here instead would pass even if the two diverged.
      const { state, holeX, holeY } = setupHoleTest("online");

      const item = new ItemEntity(holeX, holeY, ItemType.MEDKIT);
      state.entityManager.spawn(item);

      expect(state.entityManager.items.length).toBe(1);
      expect(state.itemsFellThrough).toBeUndefined();

      stepSimulationTick(state);

      expect(state.entityManager.items.length).toBe(0);
      expect(state.itemsFellThrough).toBeUndefined();
    });

    it("gives monsters moving onto a hole a 50% chance to fall", () => {
      RNG.reseed(1);
      const { state, holeX: hx, holeY: hy } = setupHoleTest("offline");

      const fallCount = runFallTrials(state, hx, hy, true);

      expect(fallCount).toBeGreaterThan(0);
      expect(fallCount).toBeLessThan(FALL_TRIALS);
    });

    it("leaves a monster already standing on a hole where it is", () => {
      RNG.reseed(1);
      const { state, holeX: hx, holeY: hy } = setupHoleTest("offline");

      const fallCount = runFallTrials(state, hx, hy, false);

      expect(fallCount).toBe(0);
    });
  });
});
