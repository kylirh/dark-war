/**
 * Runtime debug flag for the shared engine.
 *
 * Deliberately a plain in-memory flag with no platform detection: this module
 * is imported by `Game`, which the headless server loads, so it must not touch
 * `window`, `import.meta` or `process` (see docs/ARCHITECTURE.md — the engine
 * stays platform-agnostic, and `import.meta` in particular is a SyntaxError
 * under the CommonJS server build before any try/catch could run).
 *
 * Each platform entry point decides the initial value and exposes whatever
 * toggle affordance suits it:
 *   - `src/client/main.ts` seeds from `import.meta.env.VITE_DEBUG` and
 *     publishes `window.toggleDebug()` for the devtools console.
 *   - `server/multiplayer-server.ts` seeds from `process.env.VITE_DEBUG`.
 */

let debugEnabled = false;

/** Whether verbose debug timing and logging is currently on. */
export function isDebug(): boolean {
  return debugEnabled;
}

/** Turn debug logging on or off. */
export function setDebug(value: boolean): void {
  debugEnabled = value;
}

/** Flip debug logging and return the new state. */
export function toggleDebug(): boolean {
  debugEnabled = !debugEnabled;
  return debugEnabled;
}
