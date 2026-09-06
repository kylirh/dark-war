# 0003 - GameState Ownership and Coupling

**Status:** Proposed
**Date:** 2026-09-08

## Context

The `GameState` interface (`src/engine/types.ts`) is currently exposed as a large, mutable data structure containing bare arrays (like `entities: Entity[]`, `players: Player[]`) and maps. It is passed into and mutated directly by numerous systems across the engine.

A concrete cost this design is imposing is the recurring bug class of state desynchronization. Because the codebase cannot express an immutable boundary for `GameState`, it is maintained by convention. As documented in `.jules/scribe.md`, developers occasionally mutate `state.entities` directly (e.g., `state.entities.push(...)` or `.splice(...)`) instead of routing lifecycle modifications through `state.entityManager`. This direct mutation silently desyncs physics bodies, id/item lookup indexes, and the per-entity network deltas.

Currently, we rely entirely on TSDoc comments (e.g., `Read freely; never mutate it here`) to warn developers not to touch the array, which is an ineffective constraint that continues to drift.

## Options

### 1. Do nothing (Status Quo)
Continue passing the mutable `GameState` interface to all systems.
- **Cost:** We remain vulnerable to silent state desync bugs when developers accidentally mutate arrays like `entities`. TSDoc comments are not enforced by the compiler, meaning human review is the only defense against this recurring bug class.

### 2. Encapsulate GameState behind a Class
Convert `GameState` from a plain interface into a class with private fields and controlled getter/setter methods.
- **Cost:** This breaks the serialization model. Currently, `GameState` is easily serialized to/from JSON or network packets. A class would require extensive hydration logic and fundamentally alter the data-oriented design of the simulation engine.

### 3. Apply TypeScript `Readonly` and `ReadonlyArray` modifiers
Refactor the `GameState` interface to use TypeScript's immutability modifiers (e.g., `readonly entities: ReadonlyArray<Entity>`). Systems that genuinely need to mutate state will do so via dedicated managers (like `EntityManager`), while typical consumers receive a compiler error if they attempt `state.entities.push()`.
- **Cost:** Migration requires updating type signatures across `src/engine/` and carefully casting or defining writable subtypes internally where the engine legitimately applies deltas or snapshots.

## Decision

We recommend **Option 3: Apply TypeScript `Readonly` and `ReadonlyArray` modifiers**.

This approach directly solves the oracle—the boundary the code currently cannot express—by moving the constraint from convention (TSDoc) to the compiler. It prevents the silent desyncs documented in our learning logs while preserving the lightweight, serializable nature of `GameState`. It avoids the heavy runtime overhead and serialization complexity of Option 2.

## Consequences

- **What gets better:** The compiler will statically prevent developers from calling `.push()`, `.splice()`, or reassigning `state.entities`, eliminating a known, recurring source of state and physics desyncs.
- **What gets worse:** Systems that legitimately need to mutate the state (e.g., loading a snapshot, applying a network delta) will require explicit type casting or a separate `WritableGameState` internal type, increasing type verbosity in those specific boundaries.
- **What becomes harder to change:** Adding new mutable collections to `GameState` will require more careful consideration of their readonly exposure vs their internal mutation APIs.
- **Migration cost:** Medium. We must update the `GameState` interface and potentially fix widespread compiler errors in `src/engine/systems/` by routing rogue mutations through the appropriate managers.
