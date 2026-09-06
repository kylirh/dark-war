## 2026-09-01 - Unused exports in configuration and constants

**What was found:** Several constants and functions exported from utility, configuration, and constant files were entirely unused throughout the codebase. Specifically, `getMultiplayerModeFromUrl` in `src/engine/utils/multiplayer.ts`, `SPRITES_PER_ROW` in `src/engine/config/sprites.ts`, and `UTILITY_BOT_REPAIR_SEARCH_RADIUS` in `src/engine/systems/simulation/constants.ts` had no internal importers.

**Action:** Removed the unused exports entirely.

**Prevention:** Periodically use a custom script or a tool like `ts-prune` to scan for unused exports across the codebase. Be careful to use exact word boundary matching (`\b`) when confirming via grep to avoid false positives (e.g. partial variable name matches).

## 2026-09-06 - Unused exports and dead code

**What was found:** `knip` reported numerous unused exports (like `VOLUME_STEP_PERCENT`, `SAVE_CHARACTER_NAME`, `encodePNG`) across multiple files that were only used internally. The `DROP_LOOT` enum and GameEvent type union was also found to be completely unused via grep.

**Action:** Removed the `export` keyword from locally used variables and functions to encapsulate them properly. Removed `MIN_VISIBLE_FRACTION` from `module.exports` in `electron/window-state.js`. Deleted the dead `DROP_LOOT` enum member and its type variant.

**Prevention:** Use a tool like `knip` or `ts-prune` periodically to identify and remove unused exports and dead code. Wait to export a function or variable until it is actually needed by an external module.
