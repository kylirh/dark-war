# 0013 - Client Action Routing and main.ts Bloat

**Status:** Proposed
**Date:** 2026-10-28

## Context

The `src/client/main.ts` file has grown to over 3350 lines, largely because it acts as the central router for all player input and network events. Currently, almost every user action (movement, waiting, dialogue, attacking, terrain shaping, etc.) contains an `if (this.isOnlineMode())` branch. For example, `handleHoleJump`, `handleDialogueChoice`, `handleInteract`, `handlePickup`, `handleReload`, `handleDescend`, `handleAscend`, `handleGodMode`, `handleShapeTerrain` all explicitly check if they are in online mode before dispatching commands.

This inline branching forces `main.ts` to coordinate both the offline logic (dispatching directly to the local `Game` simulation and applying the effects immediately) and the online logic (updating client-side prediction state, building network action payloads, and dispatching to `MultiplayerClient`).

The cost of this design is concrete and two-fold:

1. **Divergence and Drift:** The offline/online logic divergence is prone to drifting when new actions are added and one branch is forgotten or implemented inconsistently.
2. **Testability:** Because `main.ts` mixes UI event handling, rendering, and logic routing, the client layer remains tightly coupled and difficult to test in isolation. This is highlighted as a Good Subject in our `.jules/prompts/architect.md` file ("whether `src/client/main.ts` is doing too much").

## Options

### 1. Do nothing (Status Quo)

Keep the `if (this.isOnlineMode())` branches scattered throughout `main.ts`.

**The case for this:** Zero migration effort. The logic is co-located with the UI event handlers that trigger it.

**The case against:** New actions will continue to add to the bloat of this god object, and the risk of divergence between offline and online behavior remains high. The client layer remains tightly coupled and difficult to test.

### 2. Extract an Action Router Interface

Extract an interface (e.g., `ClientActionRouter`) with two implementations: `OfflineRouter` and `OnlineRouter`. `main.ts` would delegate all intent (e.g., `this.router.move(dx, dy)`) to the router. The `OfflineRouter` executes commands on the local game loop, while the `OnlineRouter` updates prediction state and sends network packets.

**The case for this:** It cleanly separates the offline and online paths, drastically shrinking `main.ts` by pulling the divergent logic into dedicated classes. It avoids the overhead of running a local server for single-player games while still ensuring that new features are explicitly forced to implement both offline and online behaviors via the interface contract.

### 3. Run a Local Server for Single Player

Eliminate the offline path entirely by running the authoritative server logic locally (e.g., in a WebWorker or local loopback connection). The client always acts as an online client.

**The case for this:** It eliminates the offline/online divergence entirely. The client only needs to implement one path.

**The case against:** It introduces significant overhead and complexity for single-player games, requiring a local server instance to run alongside the client. It also violates the design that the engine is a pure library that can be run synchronously in an offline client.

## Decision

We recommend **Option 2: Extract an Action Router Interface**.

This approach directly addresses the bloat and coupling in `main.ts` while respecting the architectural constraint that the engine runs both offline and online. It structurally enforces the divergence by requiring new actions to implement both router contracts, preventing accidental omissions.

## Consequences

- **What gets better:** `main.ts` shrinks significantly and its responsibilities are more focused on presentation and UI coordination. The testability of the client layer improves, as the action router can be mocked during testing. The divergence is contained in two specific classes rather than mixed with rendering/UI concerns.
- **What gets worse:** The action dispatch path becomes slightly more indirect, passing through an interface rather than being handled inline.
- **What becomes harder to change:** Adding a new player action requires updating the `ClientActionRouter` interface and both implementations, rather than just adding a single block to `main.ts`.
- **Migration cost:** Medium. It requires a mechanical refactoring to extract all existing branches into the new router classes, but the underlying logic remains the same.
