# 0013 - Main.ts Client Action Router

**Status:** Proposed
**Date:** 2026-10-20

## Context

The `src/client/main.ts` file has grown to over 3,400 lines. A major factor is that it serves as the central router for all player input and network events, meaning almost every user action (movement, waiting, dialogue, attacking, terrain editing, etc.) contains an `if (this.isOnlineMode())` branch.

This inline branching forces `main.ts` to coordinate both the offline logic (dispatching directly to the local `Game` simulation and applying the effects immediately) and the online logic (updating client-side prediction state, building network action payloads, and dispatching to `MultiplayerClient`).

The cost of this design is concrete:

- **Divergence bugs:** The offline/online logic divergence is prone to drifting when new actions are added and one branch is forgotten or implemented inconsistently.
- **Testing friction:** Because `main.ts` does so much, the client layer is tightly coupled and difficult to test in isolation.
- **Bloat:** The file has become a "god object", mixing rendering, UI coordination, state mutations, and network protocol specifics.

## Options

### 1. Do nothing (Status Quo)

Keep the `if (this.isOnlineMode())` branches scattered throughout `main.ts`.

**The case for this:** Zero immediate migration cost.

**The case against:** New actions will continue to add to the bloat of this god object, and the risk of divergence between offline and online behavior remains high. The client layer remains tightly coupled and difficult to test.

### 2. Extract an Action Router Interface

Extract an interface (e.g., `ClientActionRouter`) with two implementations: `OfflineRouter` and `OnlineRouter`. `main.ts` would delegate all intent (e.g., `this.router.move(dx, dy)`) to the router. The `OfflineRouter` executes commands on the local game loop, while the `OnlineRouter` updates prediction state and sends network packets.

**The case for this:** It cleanly separates the offline and online paths, pulling the divergent logic into dedicated classes. It avoids the overhead of running a local server for single-player games while ensuring that new features explicitly implement both behaviors via the interface contract. Testability improves because the action router can be mocked.

### 3. Run a Local Server for Single Player

Eliminate the offline path entirely by running the authoritative server logic locally (e.g., in a WebWorker or local loopback connection). The client always acts as an online client.

**The case for this:** It completely eliminates the divergence problem by ensuring there is only one code path.
**The case against:** This would require a massive architectural rewrite of how single-player games are initialized, saved, and loaded. It introduces serialization overhead and potential latency (even if small) to single-player games, which currently benefit from synchronous, zero-overhead simulation steps.

## Decision

We recommend **Option 2: Extract an Action Router Interface**.

This approach cleanly separates the offline and online paths, drastically shrinking `main.ts` by pulling the divergent logic into dedicated classes. It avoids the overhead of running a local server for single-player games while still ensuring that new features are explicitly forced to implement both offline and online behaviors via the interface contract.

## Consequences

- **What gets better:** `main.ts` shrinks significantly and its responsibilities are more focused on presentation and UI coordination. The testability of the client layer improves, as the action router can be mocked during testing. The divergence is contained in two specific classes rather than mixed with rendering/UI concerns.
- **What gets worse:** We introduce a new layer of abstraction (the interface and its two implementations) that developers must navigate.
- **What becomes harder to change:** Adding a new action requires touching three files (the interface, the offline router, and the online router) instead of just inserting an `if` statement in `main.ts`.
- **Migration cost:** Medium to High. A migration cost exists to extract all the existing branches into the new router classes, but it can be done incrementally or as a mechanical refactoring.
