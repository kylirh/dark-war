## 2024-05-24 - Unused exports in configuration and constants

**What was found:** Several constants and functions exported from utility, configuration, and constant files were entirely unused throughout the codebase. Specifically, `getMultiplayerModeFromUrl` in `src/engine/utils/multiplayer.ts`, `SPRITES_PER_ROW` in `src/engine/config/sprites.ts`, and `UTILITY_BOT_REPAIR_SEARCH_RADIUS` in `src/engine/systems/simulation/constants.ts` had no internal importers.

**Action:** Removed the unused exports entirely.

**Prevention:** Periodically use a custom script or a tool like `ts-prune` to scan for unused exports across the codebase. Be careful to use exact word boundary matching (`\b`) when confirming via grep to avoid false positives (e.g. partial variable name matches).
