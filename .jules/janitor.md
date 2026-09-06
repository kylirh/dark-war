## 2026-09-01 - Unused exports in configuration and constants

**What was found:** Several constants and functions exported from utility, configuration, and constant files were entirely unused throughout the codebase. Specifically, `getMultiplayerModeFromUrl` in `src/engine/utils/multiplayer.ts`, `SPRITES_PER_ROW` in `src/engine/config/sprites.ts`, and `UTILITY_BOT_REPAIR_SEARCH_RADIUS` in `src/engine/systems/simulation/constants.ts` had no internal importers.

**Action:** Removed the unused exports entirely.

**Prevention:** Periodically use a custom script or a tool like `ts-prune` to scan for unused exports across the codebase. Be careful to use exact word boundary matching (`\b`) when confirming via grep to avoid false positives (e.g. partial variable name matches).

## 2026-09-06 - Unused exports and dead code

**What was found:** `knip` reported numerous unused exports (like `VOLUME_STEP_PERCENT`, `SAVE_CHARACTER_NAME`) across multiple files that were only used internally. The `DROP_LOOT` enum and GameEvent type union was also found to be completely unused via grep.

**Action:** Removed the `export` keyword from locally used variables and functions to encapsulate them properly. Removed `MIN_VISIBLE_FRACTION` from `module.exports` in `electron/window-state.js`. Deleted the dead `DROP_LOOT` enum member and its type variant.

**Rejected in review — `knip` was wrong about `encodePNG`, and nothing in CI would have caught it.** The first version also de-exported `encodePNG` from `tools/png.mjs`. Both `tools/gen-spritesheet.mjs` and `tools/remove-chroma.mjs` import it by name, so `npm run gen:assets` died at import time with `SyntaxError: The requested module './png.mjs' does not provide an export named 'encodePNG'`. This passed every gate: CI runs type-check, test, and build, none of which type-check `.mjs`, and none of which run the asset pipeline. `knip` was invoked ad hoc as `npx knip` with no configuration in the repo, so it never resolved the `tools/` module graph and reported a live import as dead.

**Also rejected: de-exporting 2 of the 8 `ELEVATION_*` direction bits.** `ELEVATION_SOUTH_EAST` and `ELEVATION_NORTH_WEST` were flagged only because `elevation-resolver.test.ts` happens to exercise six of the eight diagonals. They are one coherent bitmask family; exporting six of eight leaves an API that looks broken and breaks the moment anyone writes a test for the other two directions. Completeness of a constant family is a reason to keep an export that no caller currently names.

**Prevention:** An unused-export report is a hypothesis, not a finding. Before deleting an export, grep for it across `.mjs`, `.js`, and `.cjs` too — the type checker does not see those files, so a wrong deletion there fails silently at runtime instead of at build. And when a symbol belongs to a complete set (direction bits, enum-like constant families), keep the set whole.
