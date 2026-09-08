# 0003 - GameState Ownership and Coupling

**Status:** Proposed
**Date:** 2026-09-08

## Context

The `GameState` interface acts as a monolithic bucket containing both plain primitive data (e.g., `depth`, `mapWidth`) and complex class instances (`EntityManager`, `WorldPlane`). It is passed around to all simulation systems (`tick.ts`, `events.ts`, `ai.ts`).

Because `GameState` directly exposes raw arrays like `entities: Entity[]` and `players: Player[]`, the code cannot structurally express who owns these arrays or how they should be mutated. This lack of structural boundaries imposes a recurring maintenance cost:

- As documented in `.jules/scribe.md`, developers directly mutating `state.entities` (via `push`, `splice`, or reassignment) silently desync the `EntityManager` indexes, physics bodies, and network deltas. This boundary is currently maintained entirely by convention, a TSDoc warning, and defensive tests in `entity-lookup.test.ts`.
- Similarly, `state.players` must be manually kept in sync with `state.entities` by `Game`, a convention enforced by a dedicated unit test in `game.test.ts` (e.g., `this.state.players.push(player)` and `this.state.players = this.state.players.filter(...)`).

Relying on convention and tests to maintain these critical invariants means the design is under real pressure, leading to the state-sync regressions recorded in our learning logs.

## Options

### 1. Do nothing

Keep `GameState` as a single, wide-open interface. We continue to rely on TSDoc warnings, `.jules/` instructions, and invariant tests to catch state-mutation drift.

**The case for this:** The game's serialization, delta generation, and overall structure rely heavily on `GameState` being a relatively flat, easily traversable object. Imposing strict structural boundaries (like managers) would severely complicate serialization and networking. We already have robust tests (`entity-lookup.test.ts`) that catch these desyncs, meaning the current convention _works_, even if it requires developers to know it.

### 2. Extract State Repositories / Managers

Break the monolithic `GameState` into encapsulated managers (e.g., migrating `players` into `EntityManager`, or making `EntityManager` truly own and hide the entities array). Simulation systems would receive an engine context providing access to these managers, but the raw arrays (`entities`, `players`) become strictly private. State changes are exposed only through explicit lifecycle methods (e.g., `entityManager.spawn(player)`).

**The case for this:** The TypeScript compiler would structurally enforce that no simulation system can directly mutate the arrays. It eliminates the root cause of the silent state-drift bugs recorded in `.jules/scribe.md`, and the defensive invariant tests stop carrying the boundary on their own.

### 3. Make GameState strictly Read-Only for Systems

Provide a `Readonly<GameState>` to all simulation systems and force all mutations through a strict command or event-sourcing pattern that is processed centrally.

**The case for this:** It achieves immutability for the simulation systems without needing multiple manager classes, keeping the serialization benefits of a flat `GameState`.

## Decision

We recommend **Option 2: Extract State Repositories / Managers**.
While Option 1 accurately points out that serialization relies on the flat structure of `GameState`, the ongoing cost of relying on convention is too high. Our logs show that this convention is easily missed by contributors, leading to subtle networking and physics desyncs. By hiding raw arrays behind manager classes, the compiler can structurally enforce invariants, definitively solving the desync issues seen in the past. To address serialization concerns, the managers can expose `serialize()` methods.

## Consequences

- **What gets better:** The compiler enforces lifecycle boundaries. State-sync regressions caused by array mutation become impossible, so `entity-lookup.test.ts` and the `state.players` sync test in `game.test.ts` stop being the only thing standing between a stray `push` and a silently dropped melee attack. Note that this is not the same as being able to delete them: `entity-lookup.test.ts` asserts its invariant while driving real generation, ticks, combat, death, loot, explosions, and level transitions, so it would keep its value as integration coverage even once the bypass it guards against is unrepresentable. The saving is that it no longer has to be extended every time a new system touches entity lifecycle.
- **What gets worse:** Simulation systems must be updated to call manager methods or read from exposed getters instead of interacting with state properties directly, adding slight verbosity.
- **What becomes harder to change:** The monolithic snapshot and serialization logic currently relies on interrogating a single object; it will need to be refactored to gather state from multiple encapsulated managers. This makes adding new serialized fields slightly more involved.
- **Migration cost:** High. We would need to incrementally encapsulate one area of `GameState` at a time (e.g., starting with hiding `entities` and `players` inside `EntityManager`), updating every system and the serialization boundary accordingly.
