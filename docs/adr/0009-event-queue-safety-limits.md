# 0009 - Event Queue Safety Limits

**Status:** Proposed
**Date:** 2026-09-24

## Context

The Dark War simulation engine operates sequentially, reading player intents and producing a new state each tick. During this tick, actions (e.g. firing a weapon) can enqueue events, which in turn can trigger cascading effects (e.g. an explosion setting off another explosion, or a character death spawning loot and AI retargeting). A similar cascade risk exists for AI command generation, where numerous entities could potentially emit an unbounded number of commands in dense situations.

A runaway cascade could cause the server tick to hang indefinitely, blocking all clients and crashing the authoritative simulation.

Our systems currently mitigate this through deterministic hard limits: `MAX_EVENTS_PER_TICK` (1000) inside `processEventQueue`, and `MAX_COMMANDS_PER_TICK` (1000) for AI generated commands. When these limits are reached, the excess events/commands are either retained for the next tick (in the case of events) or truncated (for commands).

The alternative approach to managing long-running ticks—using real-world time to yield execution when a tick takes too long (e.g., checking `performance.now()` against a budget of 50ms)—has been proposed in discussions to make the limits "smarter" or more adaptable to server load.

## Options

### 1. Yield Execution Based on Real-World Time (e.g. 50ms Tick Budget)
Change the loop guards in `processEventQueue` and AI processing from a fixed iteration count to a real-time budget (`Date.now()` or `performance.now()`). If the budget is exceeded, the cascade yields to the next tick.

**The case for this:** It dynamically adapts to the host machine's performance. On a fast server, it processes 5,000 events within 10ms and avoids arbitrarily delaying effects. On a slow server, it prevents stalling by yielding early.

### 2. Do Nothing (Keep Deterministic Hard Limits)
Keep the explicit constants like `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK`.

**The case for this:** Determinism is a foundational constraint of the engine. Dark War relies on server-authoritative simulation with client-side prediction, and offline mode runs the exact same engine locally. If the event queue yielded based on CPU time, an identical game state with identical inputs would resolve differently depending on the hardware executing it or momentary system load. A slow client might yield after 500 events, while the server processes all 1500, immediately desyncing the local simulation from the network authority.

## Decision

We recommend **Option 2: Do Nothing (Keep Deterministic Hard Limits)**.

While a real-time budget is standard in some game architectures, it fundamentally violates the determinism required for client prediction and offline parity in this engine. The current limits of 1000 events/commands represent a strict safety boundary against infinite loops or excessive cascades while ensuring that every machine running the simulation produces the exact same outcome.

If a particular event cascade legitimately requires more than 1000 events to resolve, the correct architectural fix is to batch those effects or redesign the cascade, not to rely on variable CPU time to cover up the spike.

## Consequences

- **What gets better (or remains stable):** Client-side prediction remains perfectly synchronized with the server because both use the exact same deterministic event limit. Offline mode behaves identically to online mode.
- **What gets worse:** Extremely massive, legitimate cascades (e.g. 50 bombs detonating simultaneously) will be artificially spread across multiple ticks, which may cause visible lag in effect resolution even on high-end hardware that could have processed them instantly.
- **What becomes harder to change:** Any new system that could produce a massive number of events per tick must be designed with the 1000-event limit in mind.
- **Migration cost:** Zero, as this formally records and justifies the existing architecture.
