/**
 * Coverage for the simulation command queue and the player-side guards in
 * resolveCommand.
 *
 * Commands are the only way player and AI intent enters the simulation, so
 * these tests pin the per-tick queueing rules (including the real-time
 * coalescing of repeated player input) and the retention window.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GameState,
  Command,
  CommandType,
  EntityKind,
  EventType,
  ItemType,
  MonsterType,
  Player,
} from "../../types";
import { Game } from "../../core/game";
import { EntityManager } from "../../core/entity-manager";
import { MonsterEntity } from "../../entities/monster-entity";
import { setPositionFromGrid } from "../../utils/helpers";
import {
  enqueueCommand,
  getCommandsForTick,
  clearCommandsForTick,
  cleanupOldCommands,
  resolveCommand,
} from "./commands";

describe("Simulation Commands Management", () => {
  let state: GameState;
  let entityManager: EntityManager;

  beforeEach(() => {
    // A real EntityManager over the array `state.entities` points at, so the
    // id map and the array agree the way they do in production. Lookups in
    // resolveCommand go through `state.entityManager.getById`, and a literal
    // that set `entities` directly would leave those two views disagreeing.
    entityManager = new EntityManager();
    state = {
      commandsByTick: new Map(),
      sim: {
        mode: "PLANNING",
        nowTick: 100,
        targetTimeScale: 1,
      },
      entities: entityManager.entities,
      entityManager,
      conversations: new Map(),
      events: [],
      multiplayer: { mode: "offline" },
    } as unknown as GameState;
  });

  describe("enqueueCommand", () => {
    it("adds a new command to a new tick", () => {
      const cmd: Omit<Command, "id"> = {
        type: CommandType.WAIT,
        tick: 10,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      };
      enqueueCommand(state, cmd);

      const cmds = getCommandsForTick(state, 10);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toMatchObject(cmd);
      expect(cmds[0].id).toBeDefined();
    });

    it("appends to an existing tick", () => {
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 10,
        source: "AI",
        actorId: "m1",
        priority: 0,
        data: { type: "WAIT" },
      });
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 10,
        source: "AI",
        actorId: "m2",
        priority: 0,
        data: { type: "WAIT" },
      });

      const cmds = getCommandsForTick(state, 10);
      expect(cmds).toHaveLength(2);
      expect(cmds[0].actorId).toBe("m1");
      expect(cmds[1].actorId).toBe("m2");
    });

    it("replaces existing player command on same tick if REALTIME mode", () => {
      state.sim.mode = "REALTIME";

      enqueueCommand(state, {
        type: CommandType.MOVE,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "MOVE", dx: 1, dy: 0 },
      });

      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      });

      const cmds = getCommandsForTick(state, 15);
      expect(cmds).toHaveLength(1);
      expect(cmds[0].type).toBe(CommandType.WAIT);
      expect(cmds[0].actorId).toBe("p1");
    });

    it("keeps both player commands in PLANNING mode", () => {
      state.sim.mode = "PLANNING";

      enqueueCommand(state, {
        type: CommandType.MOVE,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "MOVE", dx: 1, dy: 0 },
      });

      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      });

      const cmds = getCommandsForTick(state, 15);
      expect(cmds).toHaveLength(2);
      expect(cmds[0].type).toBe(CommandType.MOVE);
      expect(cmds[1].type).toBe(CommandType.WAIT);
    });

    it("coalesces per actor, not per tick, in REALTIME mode", () => {
      state.sim.mode = "REALTIME";

      enqueueCommand(state, {
        type: CommandType.MOVE,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "MOVE", dx: 1, dy: 0 },
      });
      enqueueCommand(state, {
        type: CommandType.MOVE,
        tick: 15,
        source: "PLAYER",
        actorId: "p2",
        priority: 0,
        data: { type: "MOVE", dx: 0, dy: 1 },
      });
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 15,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      });

      // p1's second command replaces its first; p2 is untouched. Coalescing on
      // tick alone would drop a second player's input in online play.
      const cmds = getCommandsForTick(state, 15);
      expect(cmds).toHaveLength(2);
      expect(cmds.map((c) => c.actorId)).toEqual(["p1", "p2"]);
      expect(cmds[0].type).toBe(CommandType.WAIT);
      expect(cmds[1].type).toBe(CommandType.MOVE);
    });

    it("never coalesces AI commands, even in REALTIME mode", () => {
      state.sim.mode = "REALTIME";

      for (let i = 0; i < 2; i++) {
        enqueueCommand(state, {
          type: CommandType.WAIT,
          tick: 15,
          source: "AI",
          actorId: "m1",
          priority: 0,
          data: { type: "WAIT" },
        });
      }

      expect(getCommandsForTick(state, 15)).toHaveLength(2);
    });

    it("assigns every command a distinct id", () => {
      for (let i = 0; i < 3; i++) {
        enqueueCommand(state, {
          type: CommandType.WAIT,
          tick: 30,
          source: "AI",
          actorId: `m${i}`,
          priority: 0,
          data: { type: "WAIT" },
        });
      }

      const ids = getCommandsForTick(state, 30).map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("getCommandsForTick", () => {
    it("returns empty array for unknown tick", () => {
      expect(getCommandsForTick(state, 999)).toEqual([]);
    });
  });

  describe("clearCommandsForTick", () => {
    it("deletes the command array for a tick", () => {
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 20,
        source: "AI",
        actorId: "m1",
        priority: 0,
        data: { type: "WAIT" },
      });
      expect(getCommandsForTick(state, 20)).toHaveLength(1);

      clearCommandsForTick(state, 20);
      expect(getCommandsForTick(state, 20)).toEqual([]);
    });
  });

  describe("cleanupOldCommands", () => {
    it("keeps the trailing 50-tick window and drops everything older", () => {
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 49,
        source: "AI",
        actorId: "m1",
        priority: 0,
        data: { type: "WAIT" },
      }); // Should be deleted (100 - 50 = 50)
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 50,
        source: "AI",
        actorId: "m2",
        priority: 0,
        data: { type: "WAIT" },
      }); // Keep
      enqueueCommand(state, {
        type: CommandType.WAIT,
        tick: 99,
        source: "AI",
        actorId: "m3",
        priority: 0,
        data: { type: "WAIT" },
      }); // Keep

      cleanupOldCommands(state, 100);

      expect(getCommandsForTick(state, 49)).toEqual([]);
      expect(getCommandsForTick(state, 50)).toHaveLength(1);
      expect(getCommandsForTick(state, 99)).toHaveLength(1);
    });
  });

  describe("resolveCommand player validation", () => {
    let player: Player;

    beforeEach(() => {
      player = {
        id: "p1",
        kind: EntityKind.PLAYER,
        hp: 10,
        hpMax: 10,
        resting: false,
        nextActTick: 0,
      } as Player;
      entityManager.replaceAll([player]);
    });

    it("ignores commands from dead players", () => {
      player.hp = 0;

      const cmd: Command = {
        id: "cmd1",
        type: CommandType.WAIT,
        tick: 100,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      };

      resolveCommand(state, cmd);

      // nextActTick should remain unchanged
      expect(player.nextActTick).toBe(0);
    });

    it("ignores non-dialogue commands when in conversation", () => {
      state.conversations.set(player.id, { targetId: "m1" } as any);

      const cmd: Command = {
        id: "cmd1",
        type: CommandType.WAIT,
        tick: 100,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "WAIT" },
      };

      resolveCommand(state, cmd);

      expect(player.nextActTick).toBe(0);
    });

    it("ignores non-WAIT commands when resting", () => {
      player.resting = true;

      const cmd: Command = {
        id: "cmd1",
        type: CommandType.RELOAD,
        tick: 100,
        source: "PLAYER",
        actorId: "p1",
        priority: 0,
        data: { type: "RELOAD" },
      };

      resolveCommand(state, cmd);

      expect(player.nextActTick).toBe(0);
    });
  });
});

describe("resolveMoveCommand blocker precedence", () => {
  /**
   * The blocker search is one pass over state.entities in array order. That
   * ordering is load-bearing: a monster blocker converts the move into a melee
   * attack, while a player blocker just stops it. Scanning players as a group
   * first would flip the outcome whenever a monster sits earlier in the array
   * than a player on the same tile - which happens in online play, because
   * late-joining players are appended after the level's monsters.
   */
  function setupBlockedMove() {
    const game = new Game({ mode: "online" });
    game.reset(1);
    const state = game.getState();
    state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
    const actor = state.player;
    // Melee only lands when the selected slot holds a melee weapon or nothing;
    // the starter loadout selects a ranged weapon, which would short-circuit
    // the attack before the blocker outcome is observable.
    actor.inventorySlots[actor.selectedBarSlot].type = ItemType.BUTCHER_KNIFE;
    return { game, state, actor, tx: actor.gridX + 1, ty: actor.gridY };
  }

  function moveRight(state: GameState, actor: Player): void {
    resolveCommand(state, {
      id: "cmd-move",
      type: CommandType.MOVE,
      tick: state.sim.nowTick,
      source: "PLAYER",
      actorId: actor.id,
      priority: 0,
      data: { type: "MOVE", dx: 1, dy: 0 },
    });
  }

  it("attacks a monster that shares the tile with a later-spawned player", () => {
    const { game, state, actor, tx, ty } = setupBlockedMove();

    const monster = new MonsterEntity(tx, ty, MonsterType.MUTANT, 1);
    state.entityManager.spawn(monster);
    const other = game.addNetworkPlayer("late-joiner");
    setPositionFromGrid(other, tx, ty);

    // Monster is earlier in the array, so it wins and the move becomes melee.
    expect(state.entities.findIndex((e) => e.id === monster.id)).toBeLessThan(
      state.entities.findIndex((e) => e.id === "late-joiner"),
    );
    moveRight(state, actor);

    const damage = state.eventQueue.find(
      (e) => e.type === EventType.DAMAGE && e.data.type === "DAMAGE",
    );
    expect(damage).toBeDefined();
  });

  it("is blocked without attacking when a player is the first blocker", () => {
    const { game, state, actor, tx, ty } = setupBlockedMove();

    const other = game.addNetworkPlayer("early-joiner");
    setPositionFromGrid(other, tx, ty);

    moveRight(state, actor);

    const damage = state.eventQueue.find((e) => e.type === EventType.DAMAGE);
    expect(damage).toBeUndefined();
  });

  it("attacks a monster overlapping the tile without matching its grid cell", () => {
    // The continuous-coordinate fallback: a monster mid-step can occupy the
    // target visually while its gridX/gridY still read as the next tile over.
    const { state, actor, tx, ty } = setupBlockedMove();

    const monster = new MonsterEntity(tx + 1, ty, MonsterType.MUTANT, 1);
    // Sits in the NEXT tile, but only 18px from the target tile's centre -
    // inside the one-tile melee range the continuous fallback uses.
    monster.worldX = (tx + 1) * 32 + 2;
    monster.worldY = ty * 32 + 16;
    state.entityManager.spawn(monster);
    expect(monster.gridX).not.toBe(tx);

    moveRight(state, actor);

    const damage = state.eventQueue.find((e) => e.type === EventType.DAMAGE);
    expect(damage).toBeDefined();
  });

  it("moves freely when nothing blocks the target tile", () => {
    const { state, actor } = setupBlockedMove();
    const startX = actor.gridX;

    moveRight(state, actor);

    expect(
      state.eventQueue.find((e) => e.type === EventType.DAMAGE),
    ).toBeUndefined();
    expect(actor.gridX).toBeGreaterThanOrEqual(startX);
  });
});
