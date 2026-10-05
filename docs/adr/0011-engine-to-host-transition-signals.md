# 0011 - Engine-to-Host Transition Signals

**Status:** Proposed
**Date:** 2026-10-05

## Context

Level transitions (ascending, descending, taking portals) are currently signalled from the `src/engine/` simulation to the host environment by mutating boolean and string flags directly on `GameState` (`shouldDescend`, `shouldAscend`, `descendTarget`, `pendingPortalId`).

This design imposes a concrete cost by creating a temporal gap between when a transition command resolves and when the host acts on it. As documented in `.jules/bug.md` (2026-10-02), a bug was found where these flags were set during step 1 of `stepSimulationTick`, but the host consumed them only after the tick ended (`src/client/main.ts:1616-1634`). Because the `processEventQueue` (step 4) runs in between, any damage event occurring later in the same tick—like an explosive detonating or a hole fall—could kill the player after the transition was already committed. The host would then execute a level transition for a dead player. The fix required adding cancellation logic into `processPlayerDeathEvent` to manually clear the transition flags.

Furthermore, these fields are explicitly an offline-only mechanism. The multiplayer server clears `shouldDescend` and `shouldAscend` after every tick (`src/net/multiplayer-server.ts:874-875`) because it handles per-player migration differently, leaving `descendTarget` and `pendingPortalId` set but inert.

## Options

### 1. Do nothing (Status Quo)

Keep `shouldDescend`, `shouldAscend`, `descendTarget`, and `pendingPortalId` on `GameState`.

**The case for this:** The offline host loop is already written to read these flags. The bug where a dead player could transition has been fixed by manually clearing the flags on death. Moving this signaling mechanism would require changing the interface between the core game loop and its consumer in `src/client/main.ts`.

### 2. Extract transient Host Intents

Remove the transition flags from `GameState`. Instead, have `stepSimulationTick` or the outer `Game.step()` method return a `HostIntent[]` array or an `EngineResult` object that explicitly contains out-of-band signals intended for the host (e.g., `{ type: 'TRANSITION', portalId: '...' }`). Note that `shouldDescend` is also read intra-tick by `processHoleFalls` to prevent a descending player from falling, so this would require converting that flag into a private per-tick marker in addition to the return channel.

**The case for this:** It decouples simulation state from host routing. The engine evaluates whether the player is alive and eligible to transition at the very end of the tick, generating the intent only if the transition is still valid. The multiplayer server ignores these offline intents, and the state object no longer acts as an ephemeral message queue.

## Decision

We recommend **Option 2: Extract transient Host Intents**.

While the original bug (transitioning a dead player) is already fixed, the current design forces the engine to remember to cancel host-bound signals if the simulation state changes drastically (like player death) later in the tick. Removing these flags from `GameState` structurally prevents the host from acting on stale signals. However, since these fields are not currently serialized, the gain is entirely structural and in-memory, not a reduction in payload size.

## Consequences

- **What gets better:** The `GameState` object becomes cleaner and strictly contains persistent simulation state rather than host routing flags. The engine no longer needs explicit cancellation logic in `processPlayerDeathEvent` to clear transition flags. The boundary between engine and host becomes clearer.
- **What gets worse:** The signature of `Game.step()` or the simulation loop must change to return an intent payload, requiring updates to both the offline client loop and the multiplayer server loop. The intra-tick read in `processHoleFalls` must be satisfied by a new private marker.
- **What becomes harder to change:** Any future host-bound signal must be threaded through the new intent return path rather than simply being attached to the state object.
- **Migration cost:** Medium. We need to define the intent shape, update the command handlers to queue an intent, modify the end-of-tick logic to yield these intents, handle the intra-tick `processHoleFalls` dependency, and update `src/client/main.ts` (at `:1618-1634` and `:2415-2461`) to consume them from the return value.
