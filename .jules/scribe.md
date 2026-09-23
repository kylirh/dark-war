## 2026-09-01 - Document worldX/worldY as authoritative

**What was found:** The `CLAUDE.md` and `.jules/prompts/scribe.md` explicitly noted that `worldX`/`worldY` are the authoritative source of truth and `gridX`/`gridY` are derived and read-only, but the actual TSDoc comments on `GameEntity` and `BaseEntity` just stated "Read-only grid X coordinate derived from worldX" and "World X coordinate in pixels" without enforcing the constraint or fully explaining the _why_.

**Action:** Updated the TSDoc comments in `src/engine/entities/game-entity.ts` and `src/engine/types.ts` to explicitly state that `worldX`/`worldY` are the "authoritative source of truth" and added instructions to `gridX`/`gridY` to "Do not assign this; mutate {@link worldX} instead". Made `gridX` and `gridY` `readonly` in the `BaseEntity` interface so the TypeScript compiler enforces the read-only contract.

**Prevention:** Future modifications to entity coordinates must mutate the `worldX`/`worldY` properties. Rely on TypeScript's `readonly` modifier in interfaces to enforce constraints that runtime getters provide.

## 2026-09-04 - Document GameState.entities immutability contract

**What was found:** The `GameState.entities` array property was exposed in `src/engine/types.ts` without any TSDoc warning callers not to mutate it directly. As `CLAUDE.md` specifies, all entity lifecycle modifications (adds/removes) must route through `EntityManager` (via `state.entityManager`) because direct array mutations silently desync physics bodies, network deltas, and derived caches. This is an invisible constraint that had previously caused state sync bugs.

**Action:** Added a TSDoc comment directly to `entities: Entity[];` in `GameState` explaining the contract and pointing developers to `{@link entityManager}`, naming the three things a direct `push`/`splice`/`filter`/reassignment desyncs: the id and item lookup indexes, the physics bodies `Physics.syncEntityBodies` reconciles from spawn/remove diffs, and the per-entity network deltas built from those same diffs. Promoted the neighbouring `//` note on `entityManager` to TSDoc so the pair reads consistently and both surface in IntelliSense.

**Prevention:** Future developers checking IntelliSense on `state.entities` will now see the requirement to use `EntityManager` for mutations. Document a contract on the property where the mistake is made, not only on the class that enforces it — a `//` comment on the neighbouring property does not reach the hover.

## 2026-09-05 - Document SIM_DT_MS simulation time unit

**What was found:** The `SIM_DT_MS` constant in `src/engine/systems/simulation/constants.ts` was not documented with a TSDoc comment, making its significance as the fundamental simulation time unit unclear in IntelliSense. The prompt explicitly highlighted this as a prime example of an undocumented unit/frame of reference.

**Action:** Added a TSDoc block to `SIM_DT_MS` describing it as the conversion factor between the two time units the simulation mixes — every other duration constant in the file is in ticks, speeds are in pixels per second — with the two real conversions from the tree (`Math.ceil(30_000 / SIM_DT_MS)` in `commands.ts:102`, `velocityX * (SIM_DT_MS / 1000)` in `commands.ts:840`) and a note that it is the fixed step the client accumulator and the server interval both run on.

**Prevention:** Document the constant's _relationship to the units around it_, not just its own unit — the name already said milliseconds and the line comment already said 20Hz, so restating those adds nothing on hover. The first draft of this entry also listed "buff durations" as an example; there is no buff system in the tree. Only cite usages you have grepped for, or the doc becomes a new thing to disbelieve.

## 2026-09-15 - Document the engine's unseeded randomness prohibition

**What was found:** `AGENTS.md` and `CLAUDE.md` require gameplay randomness to go through the deterministic RNG, but the constraint was absent from the `RandomNumberGenerator` source itself, where it is actually consulted.

**Action:** Added a TSDoc block to `RandomNumberGenerator` in `src/engine/utils/rng.ts` naming the three seeded sources (this class, the shared `RNG` instance, the keyed rolls in `deterministic-roll.ts`) and why simulation randomness must not come from `Math.random()`.

**Prevention:** State the exception, or the rule gets disbelieved. The first draft said "all random behavior must go through a deterministic generator", which is false in this tree: `src/client/systems/sound.ts:141`, `renderer.ts:1216`, and `title-screen.ts:26` use `Math.random()` on purpose, and sound.ts carries a comment saying it does so precisely to avoid consuming the deterministic stream. A prohibition that contradicts commented, deliberate code teaches readers to ignore the docstring. Scope the rule to gameplay/simulation randomness and name the presentation exception.

## 2026-09-20 - Document delta compression null assignment rule

**What was found:** The memory explicitly states: "In Dark War state synchronization (`src/net/state-delta.ts`), when an optional field is cleared, `computeStateDelta` must assign `null` to the delta (e.g., `delta.field = next.field ?? null;`) rather than `undefined`." However, this constraint was missing from the documentation.

**Action:** Added a TSDoc comment to `computeStateDelta` in `src/net/state-delta.ts` explaining that clearing an optional field requires assigning `null` rather than `undefined`, and explaining why (because `JSON.stringify` drops `undefined` keys entirely, causing the client to inherit stale values).

**Prevention:** Future developers modifying `computeStateDelta` will see the constraint in IntelliSense and avoid the trap of assigning `undefined` when an optional field is removed.

## 2026-09-22 - Document RetroModal focus management contract

**What was found:** The `.jules/palette.md` log and ADR 0008 recorded a repeated failure mode: `RetroModal` does not automatically manage focus because its windows stack, but that contract was completely undocumented on the `RetroModal` class itself. As a result, developers continuously instantiated the dialog without writing the necessary capture-shift-restore boilerplate, causing accessibility regressions.

**Action:** Added a TSDoc block to the `RetroModal` class and its `show()` method in `src/client/systems/retro-modal.ts`. The documentation explicitly states that the component does not manage focus, explains why (dialog stacking), and lists the three requirements for callers: capture `document.activeElement` before `show()`, shift focus inside on `onOpen`, and restore focus on `onClose`.

**Prevention:** Document implicit architectural contracts (like "the caller is responsible for focus capture and restoration") on the specific component API where they are invoked. Future developers checking IntelliSense for `RetroModal` or its `show` method will now see the focus management requirement immediately, reducing the reliance on external memory documents.
