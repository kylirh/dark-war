# 0011 - Engine-to-Host Transition Signals

**Status:** Proposed
**Date:** 2026-10-05

## Context

Level transitions (ascending, descending, taking portals) are currently signalled from the `src/engine/` simulation to the host environment by mutating boolean and string flags directly on `GameState` (`shouldDescend`, `shouldAscend`, `descendTarget`, `pendingPortalId`).

This design imposes a concrete cost by creating a temporal gap between when a transition command resolves and when the host acts on it. As documented in `.jules/bug.md` (2026-10-02), a bug was found where these flags were set during step 1 of `stepSimulationTick`, but the host consumed them only after the tick ended (`src/client/main.ts:1616-1634`). Because the `processEventQueue` (step 4) runs in between, any damage event occurring later in the same tick—like an explosive detonating or a hole fall—could kill the player after the transition was already committed. The host would then execute a level transition for a dead player. The fix required adding cancellation logic into `processPlayerDeathEvent` to manually clear the transition flags.

Furthermore, these fields are explicitly an offline-only mechanism. The multiplayer server clears `shouldDescend` and `shouldAscend` after every tick (`server/multiplayer-server.ts:874-875`) because it handles per-player migration through the room instead; it leaves `descendTarget` and `pendingPortalId` set, which is inert only because nothing else reads them there. Storing ephemeral, host-specific routing signals on the canonical game state object puts flags on `GameState` that are irrelevant to multiplayer clients and dangerous if not manually guarded against death events.

Two things bound the scope of the problem, and neither is an argument for the status quo so much as a correction to how the cost is usually stated. None of the four fields is part of `SerializedState`, so nothing stale reaches a save file or the wire — this is in-memory state pollution, not a format problem. And the offline host consumes the flags at **two** separate sites, not one: `src/client/main.ts:1618-1634` and again at `:2415-2461` on the planning-mode action path.

## Options

### 1. Do nothing (Status Quo)

Keep `shouldDescend`, `shouldAscend`, `descendTarget`, and `pendingPortalId` on `GameState`.

**The case for this:** The offline host loop is already written to read these flags. The bug where a dead player could transition has been fixed by manually clearing the flags on death. Moving this signaling mechanism would require changing the interface between the core game loop and its consumer in `src/client/main.ts`.

### 2. Extract transient Host Intents

Remove the transition flags from `GameState`. Instead, have `stepSimulationTick` or the outer `Game.step()` method return a `HostIntent[]` array or an `EngineResult` object that explicitly contains out-of-band signals intended for the host (e.g., `{ type: 'TRANSITION', portalId: '...' }`).

**The case for this:** It decouples host routing from state the host does not own. The engine evaluates whether the player is alive and eligible to transition at the very end of the tick, generating the intent only if the transition is still valid, which makes the death case correct by construction rather than by remembering to cancel. The multiplayer server ignores these offline intents.

**What this option does not remove:** `shouldDescend` is not purely host-bound. `processHoleFalls` reads it _within_ the same tick (`src/engine/systems/simulation/tick.ts:462`) to suppress a hole fall when a stair transition has already been committed, discarding `holeCreatedTiles` on the way out. An end-of-tick intent cannot serve that read, so the engine would still need an internal per-tick marker for it. This option therefore replaces a public field with a private one plus a return channel; it does not eliminate the intra-tick flag.

## Decision

We recommend **Option 2: Extract transient Host Intents**.

The current design forces the engine to remember to cancel host-bound signals if the simulation state changes drastically (like player death) later in the tick. Generating the signal at the end of the tick, after death has been processed, eliminates that class of bug by construction rather than by a cancellation site that has to be kept in sync.

This recommendation is weaker than it first appears, and a decision should weigh the intra-tick read noted under Option 2. The death bug it is named for is already fixed, so the gain is structural rather than a live defect.

## Consequences

- **What gets better:** The engine no longer needs explicit cancellation logic in `processPlayerDeathEvent` to clear transition flags, and the boundary between engine and host becomes explicit in the type system rather than conventional. `GameState` loses three of the four fields outright.
- **What gets worse:** The signature of `Game.step()` or the simulation loop must change to return an intent payload, requiring updates to both the offline client loop and the multiplayer server loop.
- **What becomes harder to change:** Any future host-bound signal (e.g., showing a specific system dialog, changing music tracks) must be threaded through the new intent return path rather than simply being attached to the state object.
- **What does not get better:** `shouldDescend` has an intra-tick reader (`tick.ts:462`), so it becomes a private per-tick marker rather than disappearing. None of the four fields is serialized today, so there is no save-format or wire-format gain.
- **Migration cost:** Medium. We need to define the intent shape, update the command handlers to queue an intent instead of setting a flag, keep an internal marker for the `processHoleFalls` guard, modify the end-of-tick logic to yield these intents (verifying player life status), and update **both** offline consumption sites in `src/client/main.ts` plus the server's post-tick clear.
