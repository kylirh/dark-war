import { describe, it, expect, vi } from "vitest";
import {
  MAGNET_COLLECT_RADIUS,
  MAGNET_PULL_PX,
  MAGNET_RADIUS,
  stepSimulationTick,
} from "./tick";
import { Game } from "../../core/game";
import { MAX_COMMANDS_PER_TICK } from "./constants";
import * as ai from "./ai";
import {
  CELL_CONFIG,
  type GameState,
  type Item,
  ItemType,
  MonsterType,
  type Player,
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

  // Overflow drops the latest-generated commands, not the least important
  // ones, because the truncation above runs before the sort. ADR 0009 records
  // that order as open question 2 and leaves it to a human, so this pins
  // current behaviour rather than endorsing it: if the question is answered,
  // this test, the ADR, and the `MAX_COMMANDS_PER_TICK` TSDoc all change
  // together. Nothing else in the suite fails when the two are swapped.
  it("drops a late high-priority command, because truncation precedes the sort", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const tick = 10;
    state.sim.nowTick = tick;

    const mockCommands: any[] = [];
    for (let i = 0; i < MAX_COMMANDS_PER_TICK; i++) {
      mockCommands.push({
        id: `cmd-low-${i}`,
        type: "WAIT",
        actorId: `m${i}`,
        tick,
        priority: 0,
      });
    }
    mockCommands.push({
      id: "cmd-high",
      type: "WAIT",
      actorId: "m-high",
      tick,
      priority: 100,
    });

    (ai.generateAICommands as any).mockReturnValue(mockCommands);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      stepSimulationTick(state);

      // As in the test above, this asserts on the caller's array because the
      // guard truncates in place. The length check keeps the second assertion
      // honest: without it, a guard that dropped the whole array would pass.
      expect(mockCommands.length).toBe(MAX_COMMANDS_PER_TICK);
      // Sorting first would move `cmd-high` (priority 100) to index 0, where
      // the truncation cannot reach it.
      expect(mockCommands.some((c) => c.id === "cmd-high")).toBe(false);
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
    /**
     * A level with every generated item cleared and the player parked at a
     * known spot, so the only thing in magnet range is what the test drops.
     * AI is stubbed because these drive the whole of `stepSimulationTick`.
     */
    function magnetScene(): { state: GameState; player: Player } {
      const game = new Game({ mode: "offline" });
      game.reset(1);
      const state = game.getState();

      const player = state.players[0];
      player.worldX = 50;
      player.worldY = 50;
      player.itemCounts = {};

      for (const item of [...state.entityManager.items]) {
        state.entityManager.destroy(item.id);
      }

      (ai.generateAICommands as any).mockReturnValue([]);
      return { state, player };
    }

    /** Drops one item at an absolute world position, already at rest there. */
    function dropItem(
      state: GameState,
      type: ItemType,
      worldX: number,
      worldY: number,
    ): Item {
      const item = new ItemEntity(0, 0, type);
      item.worldX = worldX;
      item.worldY = worldY;
      item.prevWorldX = worldX;
      item.prevWorldY = worldY;
      state.entityManager.spawn(item);
      return item;
    }

    /** Midway through the drift band: pulled, but not yet collected. */
    const DRIFT_BAND_OFFSET = (MAGNET_COLLECT_RADIUS + MAGNET_RADIUS) / 2;

    it("pushes a PICKUP_ITEM event (processed in the same tick) when within collect radius", () => {
      const { state, player } = magnetScene();
      dropItem(
        state,
        ItemType.MEDKIT,
        player.worldX + MAGNET_COLLECT_RADIUS,
        player.worldY,
      );

      expect(player.itemCounts[ItemType.MEDKIT] || 0).toBe(0);
      expect(state.entityManager.items.length).toBe(1);

      stepSimulationTick(state);

      // The pickup event is emitted and drained by this tick's processEventQueue.
      expect(player.itemCounts[ItemType.MEDKIT]).toBe(1);
      // The item is destroyed after collection.
      expect(state.entityManager.items.length).toBe(0);
    });

    it("drifts items toward the player before collecting them", () => {
      const { state, player } = magnetScene();
      const startX = player.worldX + DRIFT_BAND_OFFSET;
      dropItem(state, ItemType.MEDKIT, startX, player.worldY);

      stepSimulationTick(state);

      expect(state.entityManager.items.length).toBe(1);
      expect(state.entityManager.items[0].worldX).toBeCloseTo(
        startX - MAGNET_PULL_PX,
      );
    });

    /**
     * On the torus the nearest player can be the one across the seam, so the
     * pull has to follow the wrapped delta: the item moves further *down* in x
     * and wraps, rather than travelling the long way up the map.
     */
    it("drifts items toward the player across the toroidal seam on the outside level", () => {
      const { state, player } = magnetScene();
      state.levelKind = "outside";

      const worldW = state.mapWidth * CELL_CONFIG.w;
      player.worldX = worldW - 10;
      const startX = DRIFT_BAND_OFFSET - 10;
      dropItem(state, ItemType.MEDKIT, startX, player.worldY);

      stepSimulationTick(state);

      expect(state.entityManager.items.length).toBe(1);
      expect(state.entityManager.items[0].worldX).toBeCloseTo(
        startX - MAGNET_PULL_PX,
      );
    });

    /**
     * `processPickupItemEvent` refuses machines on its own, so a machine inside
     * the collect radius stays put whether or not the magnet skips it -- the
     * magnet's own guard is observable only in the drift. Park the machine in
     * the drift band instead: without the category check, a vending machine
     * slides across the floor toward the player.
     */
    it("leaves machines where they are instead of drifting them", () => {
      const { state, player } = magnetScene();
      const startX = player.worldX + DRIFT_BAND_OFFSET;
      dropItem(state, ItemType.VENDING_MACHINE, startX, player.worldY);

      stepSimulationTick(state);

      expect(state.entityManager.items.length).toBe(1);
      expect(state.entityManager.items[0].worldX).toBe(startX);
    });
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
