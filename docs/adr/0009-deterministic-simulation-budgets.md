# 0009 - Deterministic Simulation Budgets

**Status:** Proposed
**Date:** 2026-09-25

## Context

The simulation engine is built around a fixed-timestep deterministic command and event pipeline. A critical requirement for server-authoritative multiplayer with client prediction is that identical initial state plus identical inputs must yield exactly the same final state on both the client and the server.

A recurring issue in simulation systems is the risk of runaway processing loops—for example, explosions that trigger secondary explosions, or an unbounded number of AI agents trying to plan paths in a single tick. Left unchecked, these cascades can hang the server or client, acting as a functional Denial of Service (DoS). The learning log (`.jules/test.md`) documents two recent instances where safety boundaries were required and tested:
- "The `processEventQueue` function limits event processing per tick by halting when it reaches `MAX_EVENTS_PER_TICK` (1000) to prevent a runaway cascade."
- "The logic that truncates generated AI commands to `MAX_COMMANDS_PER_TICK` to prevent a massive command processing cascade and potential server hang."

When designing safety limits to prevent these cascades, a common approach in other engines is to use real-time budgets (e.g., stopping work if `performance.now() - start > 16ms`). However, checking the real-time clock during the simulation loop introduces non-determinism. A fast server might process 1050 events before hitting the time limit, while a slower client might only process 800. This discrepancy would cause their simulation states to instantly and permanently diverge.

## Options

### 1. Unbounded Execution

Allow the simulation to process all generated events and commands within a single tick, regardless of how many there are.

**The case for this:** It ensures that all intended actions occur exactly on the tick they were generated. It is perfectly deterministic because it relies on no external limits. However, it leaves the server vulnerable to infinite loops or massive spikes in load that can cause the entire node process to hang, dropping all connected players.

### 2. Real-Time Execution Budgets

Limit the work per tick using `performance.now()` or `Date.now()`. If processing commands or events takes longer than the allocated tick time (e.g., 50ms), halt processing and defer the remaining work to the next tick.

**The case for this:** It provides a hard guarantee against server hangs and maintains a stable framerate/tickrate even under heavy load. However, it explicitly violates the core architectural constraint of a deterministic engine. It guarantees that multiplayer sessions will desynchronize, as hardware execution speed will govern gameplay outcomes.

### 3. Deterministic Operation Counts

Limit the work per tick using hard-coded logical operation limits, specifically `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK`. Once the simulation processes this exact number of items, it stops and defers the rest to the next tick.

**The case for this:** It places a strict upper bound on the amount of work a single tick can perform, protecting the server from infinite recursion or massive load spikes. Because the limit is based on a fixed integer count of operations rather than wall-clock time, it executes identically on all hardware, preserving perfect determinism across clients and the server.

## Decision

We recommend **Option 3: Deterministic Operation Counts**.

The core requirement of a deterministic engine is that hardware execution speed must never affect the simulation state. The system strictly enforces hard safety limits, specifically `MAX_EVENTS_PER_TICK` (1000) and `MAX_COMMANDS_PER_TICK` (1000), to prevent processing cascades and server hangs. Never introduce real-time budgets to govern simulation execution flow.

## Consequences

- **What gets better:** The server and clients are protected from processing cascades (e.g., infinite explosion recursion) without breaking determinism. Multiplayer prediction remains stable.
- **What gets worse:** If a massive, legitimate event occurs (e.g., a massive chain of barrels exploding), the effects will visually "slow down" and play out over multiple ticks instead of resolving instantly, which might feel slightly unnatural to the player.
- **What becomes harder to change:** Any new system that processes a variable amount of work per tick must be designed to pause and resume its work across ticks if it hits a deterministic limit, which adds complexity compared to a simple `while` loop.
