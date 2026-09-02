# 0001 - Offline and Online Action Routing

**Status:** Proposed
**Date:** 2026-09-01

## Context

The `src/client/main.ts` file has grown to over 3350 lines, largely because it acts as the central router for all player input and network events. Currently, almost every user action (movement, waiting, dialogue, attacking, terrain shaping, etc.) contains an `if (this.isOnlineMode())` branch.

This inline branching forces `main.ts` to coordinate both the offline logic (dispatching directly to the local `Game` simulation and applying the effects immediately) and the online logic (updating client-side prediction state, building network action payloads, and dispatching to `MultiplayerClient`). The cost of this design is that `main.ts` is doing too much, making it hard to test the client layer in isolation, and the offline/online logic divergence is prone to drifting when new actions are added and one branch is forgotten or implemented inconsistently.

## Options

1. **Do nothing**
   Keep the `if (this.isOnlineMode())` branches scattered throughout `main.ts`. New actions will continue to add to the bloat of this god object, and the risk of divergence between offline and online behavior remains high. The client layer remains tightly coupled and difficult to test.

2. **Extract an Action Router Interface**
   Extract an interface (e.g., `ClientActionRouter`) with two implementations: `OfflineRouter` and `OnlineRouter`. `main.ts` would delegate all intent (e.g., `this.router.move(dx, dy)`) to the router. The `OfflineRouter` executes commands on the local game loop, while the `OnlineRouter` updates prediction state and sends network packets.

3. **Run a Local Server for Single Player**
   Eliminate the offline path entirely by running the authoritative server logic locally (e.g., in a WebWorker or local loopback connection). The client always acts as an online client.

## Decision

We recommend **Option 2: Extract an Action Router Interface**.
This approach cleanly separates the offline and online paths, drastically shrinking `main.ts` by pulling the divergent logic into dedicated classes. It avoids the overhead of running a local server for single-player games while still ensuring that new features are explicitly forced to implement both offline and online behaviors via the interface contract.

## Consequences

- `main.ts` shrinks significantly and its responsibilities are more focused on presentation and UI coordination.
- The testability of the client layer improves, as the action router can be mocked during testing.
- The divergence is contained in two specific classes rather than mixed with rendering/UI concerns.
- A migration cost exists to extract all the existing branches into the new router classes, but it can be done incrementally or as a mechanical refactoring.
