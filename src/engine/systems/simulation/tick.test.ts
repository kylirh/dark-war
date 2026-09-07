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

    const mockCommands: any[] = [];
    for (let i = 0; i < MAX_COMMANDS_PER_TICK + 5; i++) {
      mockCommands.push({
        id: `cmd-${i}`,
        type: "WAIT",
        actorId: `m${i}`,
        tick,
      });
    }

    (ai.generateAICommands as any).mockReturnValue(mockCommands);

    stepSimulationTick(state);

    // stepSimulationTick alters the array returned by generateAICommands
    expect(mockCommands.length).toBe(MAX_COMMANDS_PER_TICK);
  });
});
