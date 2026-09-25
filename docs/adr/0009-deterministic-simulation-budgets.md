# 0009 - Deterministic Simulation Budgets

**Status:** Proposed
**Date:** 2026-09-25

## Context

The simulation engine is built around a fixed-timestep deterministic command and event pipeline. A critical requirement for server-authoritative multiplayer with client prediction is that identical initial state plus identical inputs must yield exactly the same final state on both the client and the server.

A recurring issue in simulation systems is the risk of runaway processing loops—for example, explosions that trigger secondary explosions, or an unbounded number of AI agents trying to plan paths in a single tick. Left unchecked, these cascades can hang the server or client, acting as a functional Denial of Service (DoS). The learning log (`.jules/test.md`) documents two recent instances where safety boundaries were required and tested:

- "The `processEventQueue` function limits event processing per tick by halting when it reaches `MAX_EVENTS_PER_TICK` (1000) to prevent a runaway cascade."
- "The logic that truncates generated AI commands to `MAX_COMMANDS_PER_TICK` to prevent a massive command processing cascade and potential server hang."

When designing safety limits to prevent these cascades, a common approach in other engines is to use real-time budgets (e.g., stopping work if `performance.now() - start > 16ms`). However, checking the real-time clock during the simulation loop introduces non-determinism. A fast server might process 1050 events before hitting the time limit, while a slower client might only process 800. This discrepancy would cause their simulation states to instantly and permanently diverge.

No such budget exists in the simulation today — no wall-clock read appears anywhere under `src/engine/systems/simulation/`, and the only `performance.now()` / `Date.now()` calls in the engine are the frame loop and RNG seeding, both outside the tick. This ADR therefore records a constraint to hold, not a migration to perform. Its value is that the next contributor reaching for a time budget under load meets the reasoning first; its cost is that it also pins down an overflow behaviour that is currently under-specified, described below.

## Options

### 1. Unbounded Execution

Allow the simulation to process all generated events and commands within a single tick, regardless of how many there are.

**The case for this:** It ensures that all intended actions occur exactly on the tick they were generated. It is perfectly deterministic because it relies on no external limits. However, it leaves the server vulnerable to infinite loops or massive spikes in load that can cause the entire node process to hang, dropping all connected players.

### 2. Real-Time Execution Budgets

Limit the work per tick using `performance.now()` or `Date.now()`. If processing commands or events takes longer than the allocated tick time (e.g., 50ms), halt processing and defer the remaining work to the next tick.

**The case for this:** It provides a hard guarantee against server hangs and maintains a stable framerate/tickrate even under heavy load. However, it explicitly violates the core architectural constraint of a deterministic engine. It guarantees that multiplayer sessions will desynchronize, as hardware execution speed will govern gameplay outcomes.

### 3. Deterministic Operation Counts

Limit the work per tick using hard-coded logical operation limits, specifically `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK`. Once the simulation reaches that count it stops processing for the tick.

This is what the engine does today, but the two limits do not dispose of the overflow the same way, and the difference matters more than the limits themselves:

- **Events defer.** `processEventQueue` (`systems/simulation/events.ts`) breaks out of the loop and splices off only what it processed, so the unprocessed tail stays on `state.eventQueue` and is picked up by the next call. Work is postponed, not lost. Note that the guard reads `if (processed++ > MAX_EVENTS_PER_TICK)`, so the post-increment lets 1001 events through before it trips, not 1000.
- **AI commands are dropped.** `stepSimulationTick` (`systems/simulation/tick.ts`) truncates with `aiCommands.length = MAX_COMMANDS_PER_TICK`. The excess is discarded outright; `generateAICommands` rebuilds the list from scratch next tick, so there is no queue holding the remainder. Whether an actor's intent reappears depends on whether the same intent is regenerated from the new state.

**The case for this:** It places a strict upper bound on the amount of work a single tick can perform, protecting the server from infinite recursion or massive load spikes. Because the limit is a fixed integer count of operations rather than wall-clock time, it executes identically on all hardware, preserving determinism across clients and the server.

**The case against, as currently implemented:** Truncation happens _before_ `sortCommandsDeterministically`, so which 1000 commands survive is decided by generation order rather than by priority. Overflow therefore silently drops the lowest-_generated_ commands, not the least important ones. It is deterministic — the same inputs drop the same commands on every machine, which is what this ADR is about — but it is not the behaviour "safety limit" suggests, and nothing in the suite demonstrates the 1000 ceiling is ever reached.

## Decision

We recommend **Option 3: Deterministic Operation Counts**.

The core requirement of a deterministic engine is that hardware execution speed must never affect the simulation state. The system enforces hard safety limits, `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK` (both 1000), to prevent processing cascades and server hangs. Never introduce real-time budgets to govern simulation execution flow.

Adopting this option does not endorse the current overflow handling. Two questions are left open for a human, because both are behaviour changes rather than documentation:

1. Should AI command overflow drop work, or defer it the way event overflow does?
2. If it keeps dropping, should the truncation move _after_ `sortCommandsDeterministically`, so the commands that survive are the highest-priority ones rather than the earliest-generated?

## Consequences

- **What gets better:** The server and clients are protected from processing cascades (e.g., infinite explosion recursion) without breaking determinism. Multiplayer prediction remains stable.
- **What gets worse, on the event path:** If a large legitimate cascade occurs (e.g., a long chain of barrels exploding), the effects "slow down" and play out over several ticks instead of resolving instantly, which may feel unnatural.
- **What gets worse, on the command path:** Overflow is not a slowdown but a loss. Past 1000 generated AI commands in one tick, the excess is discarded and only reappears if the same intent is regenerated next tick. In a dense enough fight the affected actors would simply not act, with a `console.error` as the only signal.
- **What becomes harder to change:** Any new system that processes a variable amount of work per tick must be designed to pause and resume across ticks if it hits a deterministic limit, which adds complexity compared to a simple `while` loop. It must also decide explicitly whether its own overflow defers or drops; the two existing limits answer that question differently, so there is no house style to copy.
