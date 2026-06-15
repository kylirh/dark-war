import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Engine-purity guard (see docs/ARCHITECTURE.md).
 *
 * The shared engine must stay platform-agnostic so the same simulation can run
 * in the browser, in Electron, and on the headless server. This test fails if
 * any engine module imports a DOM/Pixi/Electron/ws/Node dependency or a client
 * UI module — which is exactly what would make the eventual extraction into
 * `packages/engine` non-mechanical.
 */

// The platform-agnostic engine now lives entirely under src/engine.
const ENGINE_ROOTS = ["src/engine"];

const FORBIDDEN_PACKAGES = new Set(["pixi.js", "electron", "ws"]);
const NODE_BUILTINS = new Set([
  "fs",
  "path",
  "os",
  "http",
  "https",
  "net",
  "child_process",
  "worker_threads",
  "crypto",
  "stream",
  "util",
  "events",
  "url",
  "zlib",
  "tls",
  "dns",
  "readline",
  "perf_hooks",
  "dgram",
]);
// Client/presentation modules the engine must not reach into. `/sound$` matches
// the DOM audio module but not the pure `content/sound-effects` enum.
const CLIENT_MODULE_RE = /\/client\/|\/net\/|\/main$/;

function isForbidden(spec: string): boolean {
  if (FORBIDDEN_PACKAGES.has(spec)) return true;
  if (spec.startsWith("node:")) return true;
  if (NODE_BUILTINS.has(spec)) return true;
  if (CLIENT_MODULE_RE.test(spec)) return true;
  return false;
}

function listTsFiles(path: string): string[] {
  const out: string[] = [];
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
    return out;
  }
  for (const entry of readdirSync(path)) {
    out.push(...listTsFiles(join(path, entry)));
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /\b(?:from|import)\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

describe("engine purity", () => {
  it("no engine module imports DOM/Pixi/Electron/ws/Node/client code", () => {
    const violations: string[] = [];
    for (const root of ENGINE_ROOTS) {
      for (const file of listTsFiles(root)) {
        const source = readFileSync(file, "utf8");
        for (const spec of importSpecifiers(source)) {
          if (isForbidden(spec)) {
            violations.push(`${file} imports "${spec}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
