/** Registry contract: help stays synchronized and invalid input cannot run actions. */
import { describe, expect, it, vi } from "vitest";
import { DevelopmentCommands } from "./development-commands";
import { FrameProfiler } from "./frame-profiler";

describe("development commands", () => {
  const setup = (): {
    registry: DevelopmentCommands;
    run: ReturnType<typeof vi.fn>;
  } => {
    const run = vi.fn((argument: string): string => argument);
    return {
      registry: new DevelopmentCommands([
        {
          name: "godmode",
          description: "Invulnerability",
          arguments: ["on", "off", "toggle"],
          defaultArgument: "toggle",
          run,
        },
      ]),
      run,
    };
  };

  it("accepts slash, whitespace and case and defaults toggles", async () => {
    const { registry, run } = setup();
    expect(await registry.execute(" /GODMODE   ON ")).toBe("on");
    expect(await registry.execute("godmode")).toBe("toggle");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("rejects empty, unknown, extra and invalid arguments without side effects", async () => {
    const { registry, run } = setup();
    for (const line of [
      "",
      "/",
      "/whoops",
      "/godmode maybe",
      "/godmode on off",
    ])
      expect(await registry.execute(line)).toMatch(/help|Usage/);
    expect(run).not.toHaveBeenCalled();
  });

  it("generates help and completion from registered commands", async () => {
    const { registry, run } = setup();
    expect(await registry.execute("/help")).toContain(
      "/godmode [on|off|toggle] — Invulnerability",
    );
    expect(await registry.execute("/help godmode")).toContain(
      "Invulnerability",
    );
    expect(await registry.execute("/help unknown")).toContain(
      "Unknown command",
    );
    expect(await registry.execute("/help help extra")).toContain("Usage");
    expect(registry.complete("go")).toEqual(["godmode"]);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires explicit arguments where no default is declared and awaits async handlers", async () => {
    const run = vi.fn(
      async (argument: string): Promise<string> => `Started ${argument}`,
    );
    const registry = new DevelopmentCommands([
      {
        name: "profile",
        arguments: ["start", "stop"],
        description: "Measure frames",
        run,
      },
    ]);
    expect(await registry.execute("/profile")).toContain("<start|stop>");
    expect(run).not.toHaveBeenCalled();
    expect(await registry.execute("/profile start")).toBe("Started start");
  });
});

describe("frame profiler", () => {
  it("measures a session, stops collecting, and resets for the next capture", () => {
    const profiler = new FrameProfiler();
    profiler.frame(0);
    expect(profiler.command("status")).toContain("no frame intervals");
    profiler.command("start");
    profiler.frame(0);
    profiler.frame(10);
    profiler.frame(30);
    expect(profiler.command("stop")).toContain(
      "2 frames; 66.7 FPS average; 15.00 ms mean, 20.00 ms p95",
    );
    profiler.frame(100);
    expect(profiler.command("status")).toContain("2 frames");
    profiler.command("start");
    expect(profiler.command("status")).toContain("no frame intervals");
  });
});
