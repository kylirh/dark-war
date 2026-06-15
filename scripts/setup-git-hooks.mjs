#!/usr/bin/env node
/**
 * Wires git to use the committed `.githooks/` directory. Runs automatically as
 * the npm `prepare` lifecycle (i.e. after `npm install`). Idempotent and safe to
 * skip when there's no git repo (e.g. CI installing from a tarball).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  if (!existsSync(".git")) {
    // Not a git checkout (tarball install / CI artifact) — nothing to wire.
    process.exit(0);
  }
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
  console.log("✓ git hooks: core.hooksPath -> .githooks");
} catch {
  // Never fail an install because hook wiring didn't take.
  process.exit(0);
}
