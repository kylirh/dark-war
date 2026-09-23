# 0009 - Extract Simulation Pipeline Limits

**Status:** Proposed
**Date:** 2026-09-23

## Context

The simulation system imposes arbitrary hard limits on tick processing to prevent cascades or infinite loops. Specifically, `MAX_EVENTS_PER_TICK` (1000) limits `processEventQueue` in `src/engine/systems/simulation/events.ts`, and `MAX_COMMANDS_PER_TICK` (1000) truncates `aiCommands` inside `stepSimulationTick` in `src/engine/systems/simulation/tick.ts`. Both are hardcoded constants imported from `constants.ts`.

The `.jules/test.md` learning log records past test additions specifically to protect both of these limits, demonstrating that they are critical safety boundaries for the engine:
- *simulateTick command processing limit:* "The logic that truncates generated AI commands to `MAX_COMMANDS_PER_TICK` to prevent a massive command processing cascade and potential server hang had no test coverage."
- *eventQueue cascade limit:* "The `processEventQueue` function limits event processing per tick by halting when it reaches `MAX_EVENTS_PER_TICK` (1000) to prevent a runaway cascade."

However, these limits are currently buried as implementation details inside the processing loops themselves. The cost of this design is that there is no uniform mechanism for applying backpressure or logging when these cascades occur. For example, an event cascade that hits the `MAX_EVENTS_PER_TICK` limit currently splices the queue and halts execution, but this safety mechanism is entirely internal to `events.ts` rather than being a structural feature of the simulation runner. Furthermore, different build variants (e.g., an authoritative headless server vs. an embedded client) cannot configure these limits based on their respective deployment capacities.

## Options

### 1. Do nothing (Status Quo)

Keep `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK` defined in `constants.ts` and enforced ad-hoc within the individual simulation processing paths.

**The case for this:** Zero migration effort. The current bounds have proven sufficient for existing workloads, and the test suite successfully ensures the inline guards are not removed.

**The case against:** The safety boundaries are invisible to the pipeline orchestrator, and the hardcoded constants prevent tuning limits per build variant.

### 2. Centralize Limits in a Simulation Config / Pipeline Runner

Extract these safety limits into a formalized simulation configuration object passed to the `GameLoop` or `Game` constructor. Make the execution limits a structural feature of the pipeline runner.

**The case for this:** Centralizing the limits makes them visible as explicit engine constraints rather than hidden implementation details. `stepSimulationTick` and `processEventQueue` would receive these bounds from the state or config, and the pipeline runner would become responsible for catching cascade conditions and emitting telemetry. This enables adjusting limits for headless servers versus static web clients.

### 3. Run Simulation in a Worker

Move the entire simulation pipeline into a WebWorker or separate thread with a hard execution timeout, removing the need for artificial event/command count limits.

**The case for this:** It provides a true "halt" mechanism that does not depend on counting loop iterations, and prevents the main renderer from ever hanging.

**The case against:** This is a massive architectural rewrite that complicates state synchronization between the worker and the main thread, and it is largely unnecessary for the deterministic tick model.

## Decision

We recommend **Option 2: Centralize Limits in a Simulation Config / Pipeline Runner**.

Centralizing the limits formally declares the safety boundaries of the simulation pipeline. It solves the immediate pain point of hardcoded constants preventing per-variant tuning, and it unifies how cascade errors are reported, without the extreme overhead of migrating to a WebWorker architecture.

## Consequences

- **What gets better:** We gain the ability to tune simulation bounds per deployment environment. The pipeline orchestrator gains visibility into cascade events, enabling uniform telemetry and backpressure.
- **What gets worse:** We must thread the configuration through the `Game` constructor and into the simulation systems.
- **What becomes harder to change:** Logic inside `tick.ts` and `events.ts` will rely on an injected configuration object rather than statically imported constants, slightly increasing the verbosity of those functions.
- **Migration cost:** Low. We must define the configuration interface, update the `Game` initialization to accept it, and refactor the two internal simulation loops to read the limits from `state.simConfig` instead of `constants.ts`.
