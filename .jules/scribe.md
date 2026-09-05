## 2026-09-01 - Document worldX/worldY as authoritative

**What was found:** The `CLAUDE.md` and `.jules/prompts/scribe.md` explicitly noted that `worldX`/`worldY` are the authoritative source of truth and `gridX`/`gridY` are derived and read-only, but the actual TSDoc comments on `GameEntity` and `BaseEntity` just stated "Read-only grid X coordinate derived from worldX" and "World X coordinate in pixels" without enforcing the constraint or fully explaining the _why_.

**Action:** Updated the TSDoc comments in `src/engine/entities/game-entity.ts` and `src/engine/types.ts` to explicitly state that `worldX`/`worldY` are the "authoritative source of truth" and added instructions to `gridX`/`gridY` to "Do not assign this; mutate {@link worldX} instead". Made `gridX` and `gridY` `readonly` in the `BaseEntity` interface so the TypeScript compiler enforces the read-only contract.

**Prevention:** Future modifications to entity coordinates must mutate the `worldX`/`worldY` properties. Rely on TypeScript's `readonly` modifier in interfaces to enforce constraints that runtime getters provide.

## 2026-09-04 - Document GameState.entities immutability contract

**What was found:** The `GameState.entities` array property was exposed in `src/engine/types.ts` without any TSDoc warning callers not to mutate it directly. As `CLAUDE.md` specifies, all entity lifecycle modifications (adds/removes) must route through `EntityManager` (via `state.entityManager`) because direct array mutations silently desync physics bodies, network deltas, and derived caches. This is an invisible constraint that had previously caused state sync bugs.

**Action:** Added a TSDoc comment directly to `entities: Entity[];` in `GameState` explaining the contract and pointing developers to `{@link entityManager}`, naming the three things a direct `push`/`splice`/`filter`/reassignment desyncs: the id and item lookup indexes, the physics bodies `Physics.syncEntityBodies` reconciles from spawn/remove diffs, and the per-entity network deltas built from those same diffs. Promoted the neighbouring `//` note on `entityManager` to TSDoc so the pair reads consistently and both surface in IntelliSense.

**Prevention:** Future developers checking IntelliSense on `state.entities` will now see the requirement to use `EntityManager` for mutations. Document a contract on the property where the mistake is made, not only on the class that enforces it — a `//` comment on the neighbouring property does not reach the hover.

## 2026-09-05 - Document SIM_DT_MS simulation time unit

**What was found:** The `SIM_DT_MS` constant in `src/engine/systems/simulation/constants.ts` was not documented with a TSDoc comment. The previous doc wrongly cited "buff durations" which do not exist in the engine. It lacked clarity on how the constant bridges ticks (used for cooldowns, fuses, action delays) and real-time seconds (used for velocities).

**Action:** Updated the TSDoc block to `SIM_DT_MS` replacing the invented examples with actual conversions performed in the codebase (converting real world time to ticks, converting physics deltas to step displacements).

**Prevention:** Ensure all fundamental constants that define units of measurement or frames of reference (like time, coordinate systems) have accurate TSDoc comments that reference true uses in the codebase, not invented hypothetical mechanics.
