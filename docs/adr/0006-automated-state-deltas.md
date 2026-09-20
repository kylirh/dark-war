# 0006 - Automated State Delta Generation

**Status:** Proposed
**Date:** 2026-09-20

## Context

The game synchronizes state between the authoritative server and clients using a delta compression protocol implemented in `src/net/state-delta.ts`. Currently, when a developer adds a new field to `SerializedState`, they must manually update both `computeStateDelta` and `applyStateDelta` to ensure the new field is diffed, transmitted, and patched correctly.

Because `SerializedState` is just a TypeScript interface, this boundary relies entirely on human discipline and convention. When a developer forgets to update the delta logic, the TypeScript compiler remains silent, but the network state silently drifts. Our learning logs record multiple instances of this exact bug class:

- In `.jules/invariant.md`, the `simulationSeed` scalar property was added to `SerializedState` but omitted from the delta logic, leading to silent state drift and breaking the invariant that a patched baseline matches a full snapshot.
- In `.jules/bolt.md`, the `exploredByPlayer` field was omitted from `state-delta.ts`, causing clients to lose track of map discovery until a keyframe reset occurred.
- In `.jules/bolt.md`, the implicit array ordering for entities and players was lost across delta application, silently breaking simulation determinism until manual diffing logic for `entityOrder` and `playerOrder` was added.

These recurring omissions impose a significant debugging cost. Multiplayer desyncs are among the hardest bugs to trace because they only manifest as downstream logic failures (e.g., a simulation seed mismatch corrupts future generation, or missing entity order breaks AI scans).

## Options

### 1. Do nothing (Status Quo)
Rely on code review, developer memory, and the "Prevention" entries in the learning logs to ensure `src/net/state-delta.ts` is updated alongside `SerializedState`.
**The case for this:** Zero migration effort. Delta logic remains highly customizable for edge cases (like the bespoke `diffExploredByPlayer` function).

### 2. Runtime Reflection / Proxies
Replace the plain data objects in `GameState` with JavaScript Proxies that automatically record every mutation into a diff buffer, completely removing the need to write `computeStateDelta`.
**The case for this:** It removes manual diffing logic entirely. However, it violates the architectural constraint that state synchronization is a transport optimization applied to full `SerializedState` snapshots. Proxies also introduce runtime overhead to every state mutation in the hot path of the simulation tick.

### 3. Schema-Driven Code Generation
Define `SerializedState` using a schema language (like TypeBox, a custom JSON DSL, or even the existing TypeScript AST via a build script) and automatically generate `types.ts`, `StateDelta`, `computeStateDelta`, and `applyStateDelta` as part of the asset compilation pipeline.
**The case for this:** It structurally prevents the omission bug class. A new field added to the schema is guaranteed to be generated into both the interface and the delta functions. The runtime code remains plain TypeScript with no proxy overhead. Custom diff logic (like arrays) can be indicated via schema annotations.

## Decision

We recommend **Option 3: Schema-Driven Code Generation**.

The manual maintenance of `state-delta.ts` is a proven vulnerability. Schema generation solves the problem at compile time without altering the runtime architecture or introducing the performance penalty of Proxies. It aligns with our existing pipeline that compiles Aseprite and Tiled data into deterministic outputs.

## Consequences

- **What gets better:** We structurally eliminate the class of silent multiplayer desyncs caused by forgotten fields. Developers modify a single source of truth (the schema).
- **What gets worse:** We must introduce a schema definition format and maintain a new code generator step in the build pipeline.
- **What becomes harder to change:** Highly bespoke delta compression optimizations (like custom diffing for a specific array structure) will require extending the schema language to support annotations or overriding hooks, rather than just writing a manual function.
- **Migration cost:** Medium to High. We must select or write a schema tool, translate the current `SerializedState` into it, and replace the manual `state-delta.ts` with the generated output.
