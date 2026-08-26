/**
 * Coverage for the engine debug flag.
 *
 * Beyond the get/set behavior, this pins the property that made the module
 * worth extracting: it must stay free of platform globals so the headless
 * server can load `Game` without evaluating browser- or Node-only code.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { isDebug, setDebug, toggleDebug } from "./debug";

afterEach(() => setDebug(false));

describe("debug flag", () => {
  it("defaults to off", () => {
    expect(isDebug()).toBe(false);
  });

  it("reflects setDebug in both directions", () => {
    setDebug(true);
    expect(isDebug()).toBe(true);
    setDebug(false);
    expect(isDebug()).toBe(false);
  });

  it("flips and reports the new state from toggleDebug", () => {
    expect(toggleDebug()).toBe(true);
    expect(isDebug()).toBe(true);
    expect(toggleDebug()).toBe(false);
    expect(isDebug()).toBe(false);
  });

  it("touches no platform globals", () => {
    // The engine is loaded by the headless server under a CommonJS build, where
    // `import.meta` is a parse error, and by the browser, where `process` does
    // not exist. Platform seeding belongs in the entry points instead.
    const source = readFileSync("src/engine/utils/debug.ts", "utf8").replace(
      /\/\*\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      "",
    );

    for (const global of ["window", "document", "process", "import.meta"]) {
      expect(source, `debug.ts references ${global}`).not.toContain(global);
    }
  });
});
