# 0003 - GameState Ownership and Encapsulation

**Status:** Proposed
**Date:** 2026-09-07

## Context

The `GameState` interface is an open data structure passed directly to nearly every simulation subsystem (e.g., `resolveMoveCommand(state, cmd)`, `updateExplosives(state)`). Because it lacks encapsulation, any system that receives `state` can read or write any of its properties.

This openness imposes a concrete cost: silent state-synchronization bugs. As recorded in `.jules/scribe.md` (2026-09-04), systems modifying `state.entities` directly (e.g., via `push` or `splice`) bypass the `EntityManager`. This desyncs physics bodies, network deltas, and lookup caches. We currently protect this critical lifecycle boundary using only TSDoc comments and convention, which the compiler cannot enforce. A convention that causes state-drift bugs when forgotten is a failed boundary.

## Options

1. **Do nothing (Status Quo)**
   Continue passing the mutable `GameState` interface everywhere. Rely on TSDoc and human code review to prevent unauthorized mutations. The cost is the ongoing risk of state-drift bugs whenever a contributor or AI agent modifies arrays like `entities` or `explored` without routing through the proper managers.

2. **Introduce Strict TypeScript Interface Views**
   Split the data structure into capability-specific views, such as `ReadonlyGameState` (using mapped types like `DeepReadonly`). Most simulation and AI functions receive the read-only view. When a system needs to mutate the world, it must either use an explicit manager (e.g., `state.entityManager.addEntity()`) or receive a specifically scoped mutable view.

3. **Encapsulate GameState behind a Class/Facade**
   Make the `GameState` data structure private to the `Game` class. Subsystems would no longer receive a `state` object at all; instead, they receive a `SimulationAPI` facade with explicit methods like `spawnEntity(entity)` or `markTileExplored(id)`.

## Decision

We recommend **Option 2: Introduce Strict TypeScript Interface Views**.

This leverages TypeScript's structural typing to enforce boundaries without changing the runtime architecture or allocating new facade objects per tick. By typing the parameter as `ReadonlyGameState` in most simulation functions, the compiler will catch direct array mutations, enforcing the `EntityManager` boundary at compile time while keeping the data-oriented design intact.

## Consequences

- **What gets better:** The compiler prevents the exact entity desync bug recorded in the learning logs. We no longer rely on human review to enforce critical lifecycle invariants.
- **What gets worse:** TypeScript's `Readonly` and mapped types can sometimes produce noisy compiler errors. We will need to carefully define the boundary between what is genuinely read-only and which managers are allowed to mutate state.
- **Harder to change:** Subsystems that legitimately need to mutate multiple parts of the state will require explicit type casting or broader interface permissions, making quick hacks more difficult.
- **Migration cost:** Moderate to high touch, but mostly mechanical. Every function signature in `src/engine/systems/simulation/` taking `GameState` will need its type updated, and any invalid mutations will be surfaced as compiler errors that must be fixed.
