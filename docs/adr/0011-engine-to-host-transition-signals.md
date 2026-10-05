# 0011 - Engine-to-Host Transition Signals

**Status:** Proposed
**Date:** 2026-10-05

## Context

Level transitions (ascending, descending, taking portals) are currently signalled from the `src/engine/` simulation to the host environment by mutating boolean and string flags directly on `GameState` (`shouldDescend`, `shouldAscend`, `descendTarget`, `pendingPortalId`).

This design imposes a concrete cost by creating a temporal gap between when a transition command resolves and when the host acts on it. As documented in `.jules/bug.md` (2026-10-02), a bug was found where these flags were set during step 1 of `stepSimulationTick`, but the host consumed them only after the tick ended (`src/client/main.ts:1616-1634`). Because the `processEventQueue` (step 4) runs in between, any damage event occurring later in the same tick—like an explosive detonating or a hole fall—could kill the player after the transition was already committed. The host would then execute a level transition for a dead player. The fix required adding cancellation logic into `processPlayerDeathEvent` to manually clear the transition flags.

Furthermore, these fields are explicitly an offline-only mechanism. The multiplayer server clears them after every tick because it handles per-player migration differently. Storing ephemeral, host-specific routing signals on the canonical game state object pollutes the simulation state with flags that are irrelevant to multiplayer clients and dangerous if not manually guarded against death events.

## Options

### 1. Do nothing (Status Quo)

Keep `shouldDescend`, `shouldAscend`, `descendTarget`, and `pendingPortalId` on `GameState`.

**The case for this:** The offline host loop is already written to read these flags. The bug where a dead player could transition has been fixed by manually clearing the flags on death. Moving this signaling mechanism would require changing the interface between the core game loop and its consumer in `src/client/main.ts`.

### 2. Extract transient Host Intents

Remove the transition flags from `GameState`. Instead, have `stepSimulationTick` or the outer `Game.step()` method return a `HostIntent[]` array or an `EngineResult` object that explicitly contains out-of-band signals intended for the host (e.g., `{ type: 'TRANSITION', portalId: '...' }`).

**The case for this:** It completely decouples simulation state from host routing. The engine evaluates whether the player is alive and eligible to transition at the very end of the tick, generating the intent only if the transition is still valid. The multiplayer server ignores these offline intents, and the canonical state remains pure.

## Decision

We recommend **Option 2: Extract transient Host Intents**.

The current design forces the engine to remember to cancel host-bound signals if the simulation state changes drastically (like player death) later in the tick. Removing these flags from `GameState` prevents offline-specific routing logic from polluting the serialized state and eliminates the class of bugs where the host acts on stale signals.

## Consequences

- **What gets better:** The `GameState` object becomes cleaner and strictly contains simulation state. The engine no longer needs explicit cancellation logic in `processPlayerDeathEvent` to clear transition flags. The boundary between engine and host becomes clearer.
- **What gets worse:** The signature of `Game.step()` or the simulation loop must change to return an intent payload, requiring updates to both the offline client loop and the multiplayer server loop.
- **What becomes harder to change:** Any future host-bound signal (e.g., showing a specific system dialog, changing music tracks) must be threaded through the new intent return path rather than simply being attached to the state object.
- **Migration cost:** Low to medium. We need to define the intent shape, update the command handlers to queue an intent instead of setting a flag, modify the end-of-tick logic to yield these intents (verifying player life status), and update `src/client/main.ts` to consume them from the return value.
