/**
 * The deterministic command ordering contract.
 *
 * `stepSimulationTick` sorts player and AI commands with this comparator before
 * resolving them. Online play and replays depend on every peer resolving a tick
 * in the same sequence, and command resolution consumes the shared RNG, so the
 * `actorId` and `id` tie-breaks are load-bearing rather than cosmetic: without
 * them, two commands of equal priority may resolve in whatever order the
 * entity and map iteration happened to produce.
 */

import { describe, expect, it } from "vitest";
import { Command, CommandType } from "../../types";
import { sortCommandsDeterministically } from "./tick";

function command(id: string, actorId: string, priority: number): Command {
  return {
    id,
    tick: 1,
    actorId,
    type: CommandType.MOVE,
    data: {} as Command["data"],
    priority,
    source: "AI",
  };
}

const order = (commands: Command[]): string[] => commands.map((c) => c.id);

describe("sortCommandsDeterministically", () => {
  it("puts higher priority first", () => {
    const commands = [
      command("a", "actor-1", 1),
      command("b", "actor-1", 9),
      command("c", "actor-1", 5),
    ];

    sortCommandsDeterministically(commands);

    expect(order(commands)).toEqual(["b", "c", "a"]);
  });

  it("breaks equal priority by actorId, ascending", () => {
    const commands = [
      command("a", "actor-3", 5),
      command("b", "actor-1", 5),
      command("c", "actor-2", 5),
    ];

    sortCommandsDeterministically(commands);

    expect(order(commands)).toEqual(["b", "c", "a"]);
  });

  it("breaks an equal priority and actor by command id, ascending", () => {
    const commands = [
      command("c", "actor-1", 5),
      command("a", "actor-1", 5),
      command("b", "actor-1", 5),
    ];

    sortCommandsDeterministically(commands);

    expect(order(commands)).toEqual(["a", "b", "c"]);
  });

  it("applies priority before actorId", () => {
    // A low-priority command from an early-sorting actor must still lose to a
    // high-priority one from a later actor.
    const commands = [
      command("low", "actor-1", 1),
      command("high", "actor-9", 9),
    ];

    sortCommandsDeterministically(commands);

    expect(order(commands)).toEqual(["high", "low"]);
  });

  it("produces the same order regardless of input order", () => {
    const build = (): Command[] => [
      command("x", "actor-2", 5),
      command("y", "actor-1", 5),
      command("z", "actor-1", 7),
      command("w", "actor-1", 5),
    ];

    const forward = build();
    const reversed = build().reverse();
    sortCommandsDeterministically(forward);
    sortCommandsDeterministically(reversed);

    expect(order(forward)).toEqual(["z", "w", "y", "x"]);
    expect(order(reversed)).toEqual(order(forward));
  });

  it("sorts in place", () => {
    const commands = [command("b", "actor-1", 1), command("a", "actor-1", 9)];
    const same = commands;

    sortCommandsDeterministically(commands);

    expect(same).toBe(commands);
    expect(order(commands)).toEqual(["a", "b"]);
  });
});
