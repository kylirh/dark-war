# 0014 - Synchronous Death State Invalidation

**Status:** Proposed
**Date:** 2026-11-09

## Context

In Dark War's deterministic simulation, the event queue limits processing to `MAX_EVENTS_PER_TICK` to prevent runaway cascades (ADR 0009). A side effect of this safety limit is that events generated late in a cascade are deferred to the next tick.

Currently, entity death is signaled by pushing a `DEATH` or `PLAYER_DEATH` event. Because these events can be deferred, the engine can end a tick with an entity that has `0` HP but hasn't yet been processed as dead. This creates a temporal gap where the entity continues to move, transition levels, or interact with the world despite being fatally wounded.

Our learning logs (`.jules/bug.md`) record three distinct failures stemming from this seam:

- **2026-10-02:** A dead player executed a level transition (`shouldDescend`/`shouldAscend`) because the death event was deferred past the host's transition check.
- **2026-10-03:** A dead monster continued sliding because its velocity was not zeroed out until the `DEATH` event resolved in a subsequent tick.
- **2026-11-05:** The black pill item set `player.hp = 0` but failed to replicate the manual velocity-zeroing and transition-canceling logic. Under a saturated event queue, the player corpse slid and transitioned levels.

The current design requires every source of lethal damage—combat, explosions, pills, hole falls—to synchronously execute critical state invalidations (like zeroing velocity or clearing transitions) *before* pushing the death event. This is a boundary the code cannot structurally express, so it is maintained by a convention that repeatedly drifts.

## Options

### 1. Do nothing (Status Quo)

Continue to rely on developer discipline to synchronously call `haltDyingPlayer` or manually zero out monster velocity at every site that can reduce `hp` to 0, ahead of the actual `DEATH` event.

**The case for this:** It requires no architectural changes and the known bugs have been patched.
**The case against:** The black pill bug proves this convention is brittle. Any new instant-kill mechanic added to the game will likely forget the synchronous teardown boilerplate, reintroducing the bug class.

### 2. Un-deferrable Priority Events

Modify the event queue so that `DEATH` and `PLAYER_DEATH` events bypass the `MAX_EVENTS_PER_TICK` limit, ensuring they are always processed in the same tick they are generated.

**The case for this:** It keeps death logic within the existing event system and avoids adding new phases to the tick loop.
**The case against:** It violates the deterministic simulation budget (ADR 0009). If a massive explosion chain kills thousands of entities, forcing all deaths to process synchronously could cause the exact server hang the limit was designed to prevent.

### 3. Synchronous Death Phase

Remove `DEATH` and `PLAYER_DEATH` from the event system entirely. Instead, introduce a dedicated `processDeaths(state)` phase at the end of `stepSimulationTick`. This phase sweeps for entities with `hp <= 0` and performs all teardown (zeroing velocity, canceling host intents, dropping loot, despawning) in one pass.

**The case for this:** It structurally eliminates the bug class. Because death teardown is driven entirely by the `hp` state rather than the caller remembering to invoke a helper or push an event, it is impossible to kill an entity and forget the teardown.

## Decision

We recommend **Option 3: Synchronous Death Phase**.

The event system is the wrong tool for state invalidations that must strictly hold before the tick ends. By decoupling death teardown from the caller's boilerplate and the deferrable event queue, we guarantee that any entity reaching `0` HP is safely halted and cleaned up in the same tick.

## Consequences

- **What gets better:** The bug class of "walking corpses" under event overflow is structurally eliminated. We can delete `haltDyingPlayer` and the eager zeroing boilerplate in `processDamageEvent`.
- **What gets worse:** We must add a new phase to the tick loop, which requires scanning entities, adding slight overhead to every tick.
- **What becomes harder to change:** Death logic becomes a special case outside the normal event pipeline. If we later want to implement delayed death animations or revive mechanics, the synchronous phase must carefully distinguish between "dead and awaiting removal" and "fully removed".
- **Migration cost:** Medium. We must remove the death event types, migrate their handler logic into the new `processDeaths` tick phase, and update all lethal damage sources to simply mutate `hp`.
