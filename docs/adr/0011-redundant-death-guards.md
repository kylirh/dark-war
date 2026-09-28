# 0011 - Redundant Death Guards in Command Resolution

**Status:** Proposed
**Date:** 2026-09-28

## Context

The simulation tick pipeline guards against dead actors taking actions. Currently, this rule is enforced by two independent, redundant barriers. In `src/engine/systems/simulation/tick.ts`, the outermost loop calls `canActorAct` which explicitly drops actors with `hp <= 0`. However, downstream in the pipeline, `resolveCommand` (`src/engine/systems/simulation/commands.ts`) also implements its own internal `if (player && player.hp <= 0) return;` check for `PLAYER` source commands.

The concrete cost of this redundancy is paid in test complexity and maintenance drift. As documented in `.jules/test.md` (2026-09-09), testing the death-prevention logic required creating two distinct and complex test setups: one for the normal `enqueueCommand` + `stepSimulationTick` path to hit the outer guard, and a second, bespoke test calling `resolveCommand` directly to bypass the outer guard just to prove the inner one existed. This redundancy creates a false sense of security—if the outer guard is accidentally removed, tests might still pass due to the inner guard, masking the fact that the architecture's primary gating mechanism was compromised.

Furthermore, `AGENTS.md` specifically calls out: "In the Dark War engine, dead players (`hp <= 0`) are prevented from acting by a global check in `resolveCommand`... Do not duplicate these death checks inside specific command handlers." The current design violates the spirit of this memory, as we maintain identical checks at both the tick dispatcher and the command resolver boundaries.

## Options

### 1. Do nothing (Status Quo)

Maintain the redundant death checks in both `canActorAct` and `resolveCommand`.

**The case for this:** Defense in depth. If a bug in `canActorAct` allows a dead player to be scheduled for execution, `resolveCommand` acts as a fail-safe to prevent the simulation from processing invalid state mutations. The cost is currently limited to slightly heavier test setups.

### 2. Consolidate Death Checks to `canActorAct`

Remove the explicit `hp <= 0` checks from `resolveCommand` and rely entirely on `canActorAct` as the single authoritative gatekeeper for the simulation tick.

**The case for this:** It aligns the code with its actual execution path. Because `canActorAct` already filters dead actors, the check in `resolveCommand` is dead code during normal tick processing. Removing it forces tests to validate the actual outer boundary that protects the entire simulation loop, ensuring that `canActorAct` cannot silently regress. It significantly reduces test boilerplate.

## Decision

We recommend **Option 2: Consolidate Death Checks to `canActorAct`**.

The redundancy is currently imposing a real cost in test clarity and suite maintenance. When two guards protect the same invariant in a pipeline, testing the inner guard requires bypassing the outer one, which creates a synthetic execution path that does not exist in production. By consolidating the check to the outermost boundary (`canActorAct`), we establish a single source of truth for actor lifecycle capability, ensuring our tests exercise the engine as it actually runs.

## Consequences

- **What gets better:** We eliminate a class of synthetic test setups that bypass the tick loop. The engine's capability gating logic is centralized in one place (`sim-helpers.ts`), making it easier to reason about.
- **What gets worse:** If `canActorAct` is ever compromised or bypassed incorrectly by a new system, there is no secondary fail-safe within the command handlers to prevent a dead actor from executing a command.
- **What becomes harder to change:** Any new system that injects commands directly into the resolution phase (bypassing the tick queue) must be explicitly aware that it assumes responsibility for actor capability checking.
- **Migration cost:** Extremely low. It involves removing a single conditional block from `commands.ts` and updating/removing the bespoke tests in `use-item.test.ts` that were designed specifically to target it.
