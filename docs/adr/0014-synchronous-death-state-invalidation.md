# 0014 - Synchronous Death State Invalidation

**Status:** Proposed
**Date:** 2026-11-09

## Context

In Dark War's deterministic simulation, the event queue limits processing to `MAX_EVENTS_PER_TICK` to prevent runaway cascades (ADR 0009). A side effect of this safety limit is that events generated late in a cascade are deferred to the next tick: `processEventQueue` splices off only what it processed, so the remainder stays queued.

Currently, entity death is signaled by pushing a `DEATH` or `PLAYER_DEATH` event. Because these events can be deferred, the engine can end a tick with an entity that has `0` HP but hasn't yet been processed as dead. This creates a temporal gap where the entity continues to move, transition levels, or interact with the world despite being fatally wounded.

Our learning logs record four distinct failures stemming from this seam:

- **2026-10-02** (`.jules/bug.md`): a dead player executed a level transition. `shouldDescend` / `shouldAscend` are set while commands resolve and the host consumes them only after the tick ends, and nothing cleared them on death at all; the fix put the clearing into `processPlayerDeathEvent`.
- **2026-10-03** (`.jules/bug.md`): a dead monster continued sliding because its velocity was zeroed only when the `DEATH` event resolved, which the budget could push into the next tick.
- **2026-10-20** (`.jules/alpha.md`): the clearing added in `processPlayerDeathEvent` holds only as far as the event budget, so a corpse still warped when the death event was deferred past it. This is the entry that establishes deferral — rather than a missing assignment — as the cost, and it records the boundary precisely: `stepSimulationTick` drains the queue twice (`tick.ts:113` and `tick.ts:117`) and each pass gets its own `MAX_EVENTS_PER_TICK`, so a cascade of exactly one budget does not reproduce it.
- **2026-11-05** (`.jules/bug.md`): the black pill set `player.hp = 0` and replicated none of the eager invalidation `processDamageEvent` performs. With the queue saturated, the tick ended with a dead player, `shouldDescend` still true and a live `pendingPortalId`, and the host took the corpse down the stairs. Fixed by extracting `haltDyingPlayer` into `sim-helpers.ts` and calling it from both producers.

The current design requires every source of lethal damage—combat, explosions, pills, hole falls—to synchronously execute critical state invalidations (like zeroing velocity or clearing transitions) _before_ pushing the death event. This is a boundary the code cannot structurally express, so it is maintained by a convention that repeatedly drifts.

The obligation is at least concentrated today: `EventType.PLAYER_DEATH` has exactly two producers (`events.ts:207`, `commands.ts:1384`), both of which now call `haltDyingPlayer`, and `EventType.DEATH` has exactly one (`events.ts:351`), which zeroes monster velocity inline. Nothing in the type system or the tests says a third producer owes the same teardown.

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

**The case against:** `hp <= 0` is not sufficient state for the monster half of the work. `PLAYER_DEATH` carries only `playerId`, so sweeping players is straightforward, but the `DEATH` payload carries three things the entity does not: `sourceId` (which player scores the kill, with "closest player" only as a fallback), `fromExplosion` (both the recursion guard for `explodes` monsters and whether carried grenades and mines detonate instead of dropping) and the event identity itself — `processDeathEvent` passes the death event's `id` and `cause` to `triggerExplosion` as the chain-explosion cause. A sweep would have to persist the killer and the damage kind on the entity, and invent a cause for the explosions it starts, trading the caller's boilerplate for new entity fields that must be serialized and kept in sync.

Two further costs belong to this option. `processDeathEvent` consumes the deterministic RNG — the death sound, and each loot drop's chance and scatter angle — so collecting every death into one pass changes the order in which RNG is consumed relative to the other events in that tick, and identical seeds produce different loot. And a phase placed after the last `processEventQueue` (`tick.ts:117`) would push the loot drops and `explodes` detonations it generates into an already-drained queue, deferring those by a tick: the same seam, one step further out.

## Decision

We recommend **Option 3: Synchronous Death Phase**.

The event system is the wrong tool for state invalidations that must strictly hold before the tick ends. By decoupling death teardown from the caller's boilerplate and the deferrable event queue, we guarantee that any entity reaching `0` HP is safely halted and cleaned up in the same tick.

Accepting it commits to two things the implementation cannot skip: the attribution the `DEATH` payload carries today has to live somewhere the sweep can read it, and the phase has to run where the events it generates are still drained within the tick. A narrower variant is available if those prove expensive — sweep the player, whose payload is only an id, and leave monster death on the event path, where it has a single producer.

## Consequences

- **What gets better:** The bug class of "walking corpses" under event overflow is structurally eliminated. We can delete `haltDyingPlayer` and the eager zeroing boilerplate in `processDamageEvent`.
- **What gets worse:** We must add a new phase to the tick loop, which requires scanning entities, adding slight overhead to every tick. Kill attribution and the explosion recursion guard move from an event payload onto entity state, which widens the serialized entity and the network delta.
- **What becomes harder to change:** Death logic becomes a special case outside the normal event pipeline. If we later want to implement delayed death animations or revive mechanics, the synchronous phase must carefully distinguish between "dead and awaiting removal" and "fully removed".
- **Migration cost:** Medium. We must remove the death event types, migrate their handler logic into the new `processDeaths` tick phase, and update all lethal damage sources to simply mutate `hp`. Because the handler consumes RNG, the migration is not seed-preserving: existing deterministic expectations over loot and death sounds have to be re-pinned rather than assumed.
