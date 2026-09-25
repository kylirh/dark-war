# 0009 - Deterministic Simulation Budgets

**Status:** Proposed
**Date:** 2026-09-25

## Context

The simulation engine is built around a fixed-timestep deterministic command and event pipeline. A critical requirement for server-authoritative multiplayer with client prediction is that identical initial state plus identical inputs must yield exactly the same final state on both the client and the server.

A recurring issue in simulation systems is the risk of runaway processing loops—for example, explosions that trigger secondary explosions, or an unbounded number of AI agents trying to plan paths in a single tick. Left unchecked, these cascades can hang the server or client, acting as a functional Denial of Service (DoS). The learning log (`.jules/test.md`) documents two recent instances where safety boundaries were required and tested:

- "The `processEventQueue` function limits event processing per tick by halting when it reaches `MAX_EVENTS_PER_TICK` (1000) to prevent a runaway cascade."
- "The logic that truncates generated AI commands to `MAX_COMMANDS_PER_TICK` to prevent a massive command processing cascade and potential server hang."

There is no wall-clock real-time budget mechanism anywhere under `src/engine/systems/simulation/`; the only time reads in the engine are in the frame loop (`game-loop.ts:40`) and RNG seeding, both safely outside the tick. This document formally records this constraint to ensure it is not compromised by future additions.

## Options

### 1. Unbounded Execution

Allow the simulation to process all generated events and commands within a single tick, regardless of how many there are.

**The case for this:** It ensures that all intended actions occur exactly on the tick they were generated. It is perfectly deterministic because it relies on no external limits. However, it leaves the server vulnerable to infinite loops or massive spikes in load that can cause the entire node process to hang, dropping all connected players.

### 2. Deterministic Operation Counts

Limit the work per tick using hard-coded logical operation limits, specifically `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK`. Once the simulation processes this exact number of items, it stops and defers the rest to the next tick.

**The case for this:** It places a strict upper bound on the amount of work a single tick can perform, protecting the server from infinite recursion or massive load spikes. Because the limit is based on a fixed integer count of operations rather than wall-clock time, it executes identically on all hardware, preserving perfect determinism across clients and the server.

## Decision

We recommend **Option 2: Deterministic Operation Counts**.

The core requirement of a deterministic engine is that hardware execution speed must never affect the simulation state. The system strictly enforces hard safety limits, specifically `MAX_EVENTS_PER_TICK` (1000) and `MAX_COMMANDS_PER_TICK` (1000), to prevent processing cascades and server hangs. Never introduce real-time budgets to govern simulation execution flow. (Note: the event limit checks `if (processed++ > MAX_EVENTS_PER_TICK)`, which trips after 1001 events are processed, not exactly 1000).

Whether the overflow logic for `MAX_COMMANDS_PER_TICK` should be changed to defer execution like `MAX_EVENTS_PER_TICK` does, and whether command truncation should be moved after priority sorting rather than before, remain open questions for a human implementer to decide.

## Consequences

- **What gets better:** The server and clients are protected from processing cascades (e.g., infinite explosion recursion) without breaking determinism. Multiplayer prediction remains stable.
- **What gets worse:** Hitting a limit means intended simulation work does not happen when it should. `processEventQueue` leaves the unprocessed tail on `state.eventQueue` to defer to the next tick. `stepSimulationTick` discards excess commands (so actors do not act), and limits generation _before_ deterministic sorting, which means the surviving 1000 commands are decided by generation order rather than priority.
- **What becomes harder to change:** Any new system that processes a variable amount of work per tick must be designed to handle overflow logic if it hits a deterministic limit, which adds complexity compared to a simple `while` loop.
