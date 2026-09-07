import { describe, it, expect, vi } from "vitest";
import { stepSimulationTick } from "./tick";
import { Game } from "../../core/game";
import { MAX_COMMANDS_PER_TICK } from "./constants";
import * as ai from "./ai";

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
});
