## 2026-11-04 - Consolidate duplicate tile occupancy checks

**What was found:** Checking if a specific grid coordinate is occupied by a monster or player (`state.entities.some(...)`) was manually duplicated across six places in `commands.ts`, `events.ts`, `tick.ts`, `ai.ts`, and `sim-helpers.ts` itself with minor variable naming variances (`e`/`entity`, `nx`/`tx`/`tileX`).

**Action:** Created a new `isTileOccupiedByActor(state, tx, ty, excludeId?)` helper in `sim-helpers.ts`. Replaced all six duplicates to use this consolidated function.

**Prevention:** Before writing a manual `state.entities.some(...)` filter to find entities at a location, check `sim-helpers.ts` for existing lookup logic, or extract it if multiple sites perform identical filtering. Ensure names accurately reflect what they check (e.g. `isTileOccupiedByActor` rather than `isOccupied` since walls also occupy tiles) and count occurrences across the entire codebase to avoid missing cases.
