# 0014 - Synchronous State Invalidation on Entity Death

**Status:** Proposed
**Date:** 2026-11-04

## Context

The simulation engine limits event processing per tick with `MAX_EVENTS_PER_TICK` to prevent runaway cascades (as formalized in ADR 0009). Excess events in the queue are deferred to the next tick. When an entity takes lethal damage, a `DEATH` or `PLAYER_DEATH` event is queued.

This design creates a temporal gap between an entity's HP reaching zero and its death being fully processed. This gap has imposed a concrete cost, repeatedly causing bugs where an entity is functionally dead but continues to act on the world. The learning logs (`.jules/bug.md` and `.jules/alpha.md`) record three instances of this failure:

- **2026-10-02 & 2026-10-20:** A player who initiated a level transition (setting `shouldDescend` or similar flags) and received lethal damage in the same tick during a cascade would still be warped by the host. The `PLAYER_DEATH` event that would have cleared the flags was deferred to the next tick, leaving the host to act on the pending transition of a dead player.
- **2026-10-03:** A monster receiving lethal damage would keep sliding for an extra tick because its velocity was not zeroed until the `DEATH` event resolved, which had been deferred by the event queue budget.

To fix these bugs, critical state invalidations (canceling transitions, zeroing velocity) were moved into `processDamageEvent` to execute synchronously the moment HP reaches zero, while the actual entity removal and heavy cleanup remained in the deferred death events.

## Options

### 1. Maintain Split Invalidation (Status Quo)

Keep `DEATH` and `PLAYER_DEATH` events in the deferred queue for heavy cleanup (dropping items, removing the entity from `EntityManager`, sending alerts), but mandate that critical state invalidations (stopping movement, canceling pending routing signals) execute synchronously when HP reaches zero.

**The case for this:** It preserves the `MAX_EVENTS_PER_TICK` cascade protection for the most expensive parts of entity removal, while preventing the observable bugs caused by dead entities continuing to interact with the world.
**The case against:** It splits "death" into two distinct phases in the codebase. Developers must manually decide whether each new piece of death-related logic belongs in the synchronous damage handler or the deferred event handler, increasing cognitive load.

### 2. Process Death Events Synchronously

Bypass the event queue's `MAX_EVENTS_PER_TICK` limit exclusively for `DEATH` and `PLAYER_DEATH` events, executing them immediately inline when HP reaches zero.

**The case for this:** It re-unifies death logic. An entity dies and is completely cleaned up in one step, making the codebase easier to reason about and eliminating the temporal gap entirely.
**The case against:** It explicitly violates the safety bounds established in ADR 0009. A single explosion killing 50 monsters would trigger 50 synchronous death events, which in turn spawn item drops, trigger on-death abilities, and cause further cascades. This reintroduces the risk of server hangs under heavy load.

### 3. Defer All Action Resolution

Instead of applying movement and transition routing at the end of the current tick, modify the engine so all systems wait until the event queue has completely drained (potentially spanning multiple ticks) before acting on any flags.

**The case for this:** It fixes the temporal gap by ensuring no end-of-tick logic runs until all deferred events (including deaths) have fully resolved.
**The case against:** It is fundamentally incompatible with a real-time multiplayer game. A heavy cascade would cause players' movement and actions to freeze for multiple ticks until the queue clears, severely degrading the gameplay experience.

## Decision

We recommend **Option 1: Maintain Split Invalidation**.

The safety limits of the event queue are necessary to prevent server hangs, but allowing dead entities to slide or warp breaks the simulation. Splitting the invalidation acknowledges both constraints: we synchronously disable the entity's ability to act on the world the moment it dies, but we defer the heavy allocation and cleanup work to respect the simulation budget.

## Consequences

- **What gets better:** We avoid severe cascade hangs without suffering the bugs of dead entities continuing to move or transition.
- **What gets worse:** Death logic is permanently split. Developers must learn and maintain the boundary between synchronous invalidation and deferred cleanup.
- **What becomes harder to change:** Any new state attached to an entity that implicitly affects the world (like velocity or routing flags) must be explicitly evaluated to see if it requires synchronous cancellation on HP zero.
- **Migration cost:** None. The current codebase already implements this approach for velocity and transitions; this ADR formalizes it to guide future death logic.
