# 0011 - Splitting Client Main Responsibility

**Status:** Proposed
**Date:** 2026-10-02

## Context

`src/client/main.ts` is currently the main entry point for the game client. Over time, it has grown significantly (currently ~3450 lines) and taken on many diverse responsibilities. It initializes the engine, manages the main game loop (`GameLoop`), handles continuous offline-specific logic (like CTDM threat dilation), tracks input (mouse aiming, wheel weapon cycling), processes interaction state (Matter Manipulator mining flags), hosts the prediction interpolation logic for multiplayer, manages UI overlays and menus (`RetroWindowChrome`, `GameMenu`, `SaveSlotDialog`, `IntroStory`), coordinates with the native Electron shell via `window.native`, and acts as the orchestrator for multiplayer discovery and connection workflows.

The current design imposes a substantial cognitive load on developers. Any modification to the offline simulation, the online prediction model, UI logic, or Electron shell integration inevitably touches `main.ts`. Reviewing pull requests that modify `main.ts` is difficult because the file lacks a single coherent responsibility, and the intertwined state makes unintended side-effects common. This monolithic structure also makes testing the client layer harder, as tests must mock or work around unrelated behaviors (like online prediction or input tracking) just to test UI logic.

The learning log (`.jules/palette.md`, `.jules/bolt.md`) records issues stemming from DOM focus management, UI transitions, and game loop interactions that all reside within this single large file, showing the cost of having presentation, simulation loop, and network prediction intertwined. Furthermore, `git log` shows that nearly every feature branch touches `main.ts`, making it a continuous source of merge conflicts.

## Options

### 1. Do nothing (Status Quo)

Leave `main.ts` as it is. Accept that it functions as a central "god object" orchestrating the entire client application.

**The case for this:** Zero migration effort. No refactoring required. The code currently works. Refactoring a 3450-line file is risky and takes time away from feature work.

### 2. Extract UI and System Orchestration

Refactor `main.ts` by extracting discrete responsibilities into smaller, focused classes or systems. For example:
- Extract input management and camera tracking into a dedicated `ClientInputController`.
- Extract multiplayer prediction and interpolation into a `ClientPredictionModel`.
- Extract the main menu, dialog flows, and native shell coordination into an `AppOrchestrator` or `ClientShell`.

`main.ts` would then simply bootstrap these components and wire them together.

**The case for this:** Dramatically improves code organization, readability, and testability. It aligns with the existing `src/client/systems/` structure (e.g., `Renderer`, `Sound`, `Music`), moving away from a single monolithic file.

## Decision

We recommend **Option 2: Extract UI and System Orchestration**.

The current size and scope of `main.ts` are becoming a bottleneck for client-side development. By breaking it apart into cohesive systems, we make the client layer easier to test (aligning with the goals of ADR 0002) and significantly reduce the cognitive overhead of modifying client logic. The high frequency of merge conflicts on `main.ts` is a direct result of its overloaded responsibilities.

## Consequences

- **What gets better:** Readability, maintainability, and testability of the client code. Clearer separation between game logic, UI orchestration, and network prediction. Pull requests will be more focused and have fewer merge conflicts on the entry point file.
- **What gets worse:** We introduce new files and architectural layers that developers must learn.
- **What becomes harder to change:** Global state access. If components are strictly isolated, sharing state (like the current threat level) might require explicit event passing or shared state objects instead of simple property access within `DarkWar`.
- **Migration cost:** Medium to High. Carefully extracting the logic from `main.ts` without breaking offline/online behavior, input handling, or UI flows will require thorough refactoring and testing.
