import { describe, it, expect, beforeEach } from "vitest";
import {
  GameState,
  Command,
  CommandType,
  EntityKind,
  Player,
  EventType,
} from "../../types";
import {
  enqueueCommand,
  getCommandsForTick,
  clearCommandsForTick,
  cleanupOldCommands,
  resolveCommand,
} from "./commands";

describe("Simulation Commands Management", () => {
  let state: GameState;

  beforeEach(() => {
    state = {
      commandsByTick: new Map(),
      sim: {
        mode: "PLANNING",
        nowTick: 100,
        targetTimeScale: 1,
      },
      entities: [],
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

    it("does not replace existing player command if TURN_BASED mode", () => {
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
    it("removes commands older than 50 ticks from current tick", () => {
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
      state.entities = [player];
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
