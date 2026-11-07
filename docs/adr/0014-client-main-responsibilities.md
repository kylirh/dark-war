# 0014 - Client Main Responsibilities

**Status:** Proposed
**Date:** 2026-11-07

## Context

The `src/client/main.ts` file has grown to over 3450 lines. It acts as the application's root entry point, but it currently takes on far more responsibility than orchestration. It directly defines the `DarkWar` class (the core application instance), the `MainMenuApp` class, and multiple helper functions. It handles explicit DOM mutation for overlays, modal instantiation, input-to-command translation, and even direct execution of game logic (e.g., dispatching transitions for both offline and online modes, as noted in ADR 0001).

The concrete cost of this monolithic design is high coupling and poor testability. Changes to one presentation feature frequently require modifying `main.ts`, leading to merge conflicts and increased cognitive load for developers trying to trace execution flow. The sheer size of the file acts as a barrier to understanding the client's architecture, and it forces a mix of DOM manipulation, network handling, and game logic into a single scope.

## Options

### 1. Do nothing (Status Quo)

Leave `src/client/main.ts` as the central orchestrator and logic container for the client.

**The case for this:** The application currently works. Developers know where to look (in `main.ts`) for the entry point logic. Splitting the file requires significant refactoring and introduces new organizational concepts that developers must learn.
**The case against:** The file will continue to grow unbounded. Its lack of cohesion makes it difficult to test presentation systems in isolation, contributing directly to the testability issues discussed in ADR 0002.

### 2. Extract Sub-Systems and Refactor into an Orchestrator

Refactor `src/client/main.ts` so that it acts solely as an orchestrator. Move the `DarkWar` class, the `MainMenuApp` class, and UI orchestration logic into separate files (e.g., `src/client/app/dark-war-app.ts`, `src/client/app/main-menu-app.ts`). Move the input-to-command translation layer into a dedicated command router.

**The case for this:** This strongly adheres to the Single Responsibility Principle. `main.ts` would become a lightweight entry script that merely bootstraps dependencies and launches the active application state (Main Menu vs. Game). It drastically improves the testability of individual components by allowing them to be imported independently of the heavy bootstrapping logic.
**The case against:** It requires moving a large volume of code, which could cause significant merge conflicts with other in-flight branches.

### 3. Adopt a formal Component Framework (e.g., React/Vue) for UI

Rewrite the DOM manipulation and presentation logic inside `main.ts` (and the `src/client/systems/` directory) using a formal frontend framework to handle view state.

**The case for this:** It provides a structured, declarative way to manage UI state, completely eliminating the imperative DOM manipulation currently bloating `main.ts`.
**The case against:** This represents a massive architectural shift and rewrites the entire presentation layer. It introduces heavy third-party dependencies and fundamentally alters the project's build pipeline and tech stack, which is overkill for the current scope.

## Decision

We recommend **Option 2: Extract Sub-Systems and Refactor into an Orchestrator**.

The current size of `main.ts` (3450+ lines) is a symptom of missing boundaries within the client architecture. By extracting the core application classes (`DarkWar`, `MainMenuApp`) and dedicated routers into separate files, `main.ts` can return to its intended role as a simple bootstrapping script. This change improves cohesion, reduces merge conflicts, and directly supports efforts to improve client layer testability without requiring a drastic shift to a new frontend framework.

## Consequences

- **What gets better:** `src/client/main.ts` becomes small and focused. The extracted classes (`DarkWar`, `MainMenuApp`, etc.) can be unit-tested in isolation (especially critical if JSDOM is adopted as per ADR 0002).
- **What gets worse:** The client application logic is spread across more files, requiring developers to navigate a slightly deeper directory structure to follow the bootstrapping flow.
- **What becomes harder to change:** Global state that implicitly relied on being in the same file scope as other `main.ts` variables will need to be explicitly passed as dependencies or managed through a proper state container.
- **Migration cost:** High in terms of line changes, but low in terms of logic changes. This is primarily a structural extraction and file-moving exercise.
