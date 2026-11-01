# 0013 - AI Command Overflow Handling

**Status:** Proposed
**Date:** 2026-11-01

## Context

ADR 0009 established that deterministic operation counts (`MAX_COMMANDS_PER_TICK`) must bound the simulation work per tick to prevent cascades and desyncs. However, it explicitly left open how command overflow should be handled. Currently, in `src/engine/systems/simulation/tick.ts`, `stepSimulationTick` truncates the `aiCommands` array to `MAX_COMMANDS_PER_TICK` *before* running `sortCommandsDeterministically`.

The concrete cost is that in dense simulation ticks (e.g., many actors in a firefight), overflow silently drops the latest-generated commands rather than the lowest-priority ones. A `.jules/test.md` entry (2026-10-22) documents this exact behavior. This means an actor's critical action (like attacking or healing) might be dropped simply because it was generated later in the loop, while a low-priority idle wander generated earlier survives. This makes the game's AI behavior arbitrary under load.

## Options

### 1. Do nothing (Status Quo)

Continue truncating the `aiCommands` array before sorting it.

**The case for this:** It is fast, as `sortCommandsDeterministically` only ever has to sort a maximum of `MAX_COMMANDS_PER_TICK` items.
**The case against:** It drops AI intents arbitrarily based on generation order, leading to unpredictable game behavior under load where critical actions are discarded in favor of trivial ones.

### 2. Truncate after sorting

Generate all AI intents, sort the entire resulting array with `sortCommandsDeterministically`, and then truncate it to `MAX_COMMANDS_PER_TICK`.

**The case for this:** Load shedding becomes prioritized rather than arbitrary. When the engine drops AI work to meet the safety limit, it reliably drops the least important actions first.
**The case against:** Sorting up to a few thousand items is slightly more expensive than sorting exactly `MAX_COMMANDS_PER_TICK` items, though the limit is low enough that this performance difference is negligible in practice.

### 3. Defer excess commands to the next tick

Rather than dropping them, place overflow AI commands into a persistent queue to be processed on the next tick, similar to how `processEventQueue` defers excess events.

**The case for this:** No AI intent is lost, preserving all generated work.
**The case against:** AI commands represent intents based on the *current* state of the world (e.g., pathing to a target's current position, or attacking an enemy that is in range). Deferring them means executing stale intents in the next tick. The target may have moved, died, or the terrain may have changed, leading to invalid actions.

## Decision

We recommend **Option 2: Truncate after sorting**.

AI commands are contextual intents that expire quickly. Deferring them (Option 3) risks executing stale logic, and arbitrarily dropping them based on generation order (Option 1) creates bugs under load. Truncating after priority sorting ensures that when the engine must shed load to preserve determinism and prevent hangs, it sacrifices the least critical actions first.

## Consequences

- **What gets better:** The engine handles AI overload gracefully by preserving critical actions over trivial ones.
- **What gets worse:** The sorting function must sort the full, un-truncated list of generated AI commands, which introduces a tiny overhead in extreme overflow scenarios.
- **What becomes harder to change:** Any new AI command type must ensure its priority value is accurately tuned relative to existing commands, as priority now directly dictates survival under load.
- **Migration cost:** Extremely low. Moving the `.length = MAX_COMMANDS_PER_TICK` truncation line to immediately follow the `sortCommandsDeterministically` call in `src/engine/systems/simulation/tick.ts`.
