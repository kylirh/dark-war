# 0013 - AI Command Overflow Handling

**Status:** Accepted
**Date:** 2026-11-01

## Context

ADR 0009 established that deterministic operation counts (`MAX_COMMANDS_PER_TICK`) must bound the simulation work per tick to prevent cascades and desyncs. However, it explicitly left open how command overflow should be handled. Historically, in `src/engine/systems/simulation/tick.ts`, `stepSimulationTick` truncated the `aiCommands` array to `MAX_COMMANDS_PER_TICK` _before_ running `sortCommandsDeterministically`. This was fixed as part of this ADR's adoption.

The concrete cost is that in dense simulation ticks (e.g., many actors in a firefight), overflow silently drops the latest-generated commands rather than the lowest-priority ones. A `.jules/test.md` entry (2026-10-22) documents this exact behavior, and the doc comment on `MAX_COMMANDS_PER_TICK` in `systems/simulation/constants.ts` records it alongside the limit. ADR 0009 leaves it open as the second of two questions it defers to a human.

How much this currently costs depends on how finely AI commands are prioritized, and today the answer is: barely at all. `generateAICommands` emits exactly two priority values. `priority: 1` is used only for ranged fire — grenade (`ai.ts:1787`), land mine (`ai.ts:1805`) and equipped weapon (`ai.ts:1849`). Everything else, including melee attacks, movement, idle wander and wait, is `priority: 0`, and there is no healing command. So the behaviour this ADR addresses is specifically that a monster's ranged shot can be dropped while another monster's idle wander survives; it does not today distinguish a melee attack from a wander.

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
**The case against:** AI commands represent intents based on the _current_ state of the world (e.g., pathing to a target's current position, or attacking an enemy that is in range). Deferring them means executing stale intents in the next tick. The target may have moved, died, or the terrain may have changed, leading to invalid actions.

## Decision

We recommend **Option 2: Truncate after sorting**.

AI commands are contextual intents that expire quickly. Deferring them (Option 3) risks executing stale logic, and arbitrarily dropping them based on generation order (Option 1) creates bugs under load. Truncating after priority sorting ensures that when the engine must shed load to preserve determinism and prevent hangs, it sacrifices the least critical actions first.

The honest size of the win should temper the urgency: with only two priority levels in use, Option 2 buys preservation of ranged fire over movement and little else, and nothing in the suite demonstrates the 1000-command ceiling is ever reached. Its value is that it makes the limit behave the way "safety limit" reads, and that it becomes correct automatically as priorities are elaborated — not that it fixes an observed in-game failure.

## Consequences

- **What gets better:** The engine handles AI overload gracefully by preserving critical actions over trivial ones.
- **What gets worse:** The sorting function must sort the full, un-truncated list of generated AI commands, which introduces a tiny overhead in extreme overflow scenarios.
- **What becomes harder to change:** Any new AI command type must ensure its priority value is accurately tuned relative to existing commands, as priority now directly dictates survival under load. That is a new obligation: priority is currently near-vestigial on the AI path, with two values and only ranged fire above the floor.
- **Migration cost:** Extremely low. Moving the `.length = MAX_COMMANDS_PER_TICK` truncation line to immediately follow the `sortCommandsDeterministically` call in `src/engine/systems/simulation/tick.ts`.
