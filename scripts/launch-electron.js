#!/usr/bin/env node
/**
 * Launch the app in dev by running the Electron binary directly against the
 * project (package.json `main` → electron/main.js).
 *
 * We deliberately do NOT package with electron-builder here: a full `--mac dir`
 * pack on every launch is slow and floods the console (code-signing warnings,
 * effective-config dumps, etc.). Packaging belongs to `npm run build`. In dev the
 * window just shows the stock Electron name/icon — cosmetic only.
 */
const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const electronPath = require("electron");

console.log("▶ launching Dark War (Electron)…");

const child = spawn(electronPath, [rootDir, ...args], {
  cwd: rootDir,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
