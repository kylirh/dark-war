# 0002 - Testability of Client Layer

**Status:** Proposed
**Date:** 2024-11-20

## Context

The `src/client/systems/` directory contains critical presentation, input, UI, and DOM-interaction logic. Currently, this layer is primarily validated through TypeScript type-checking and manual testing, as unit tests run in a pure Node environment without DOM globals (`jsdom` is explicitly not installed).

The lack of automated UI testability has led to recurring, preventable regressions in the client layer, imposing a direct cost on human review time and player security:
- In `.jules/sentinel.md`, multiple XSS and HTML-escaping bugs were recorded (e.g., `DiscoveryManager` UDP injection, unescaped `RetroModal` titles, and type-confusion DoS via `JSON.parse` output). These vulnerabilities stemmed from template literal interpolation in `innerHTML` where escaping was either omitted or implemented incorrectly.
- In `.jules/palette.md`, several ARIA and focus management regressions were recorded (e.g., `GameMenu` misusing `role="menu"`, focus dropping into the background canvas on modal opens, and broken keyboard navigation in `storyExpandTab` via immediate `.blur()`).

These are exactly the classes of bugs that unit tests with a DOM environment are designed to catch. Without a mock DOM, we cannot write tests asserting that `innerHTML` sanitizes input correctly, that `document.activeElement` moves to the correct modal, or that `aria-expanded` toggles appropriately. Type-checking cannot verify string interpolation or DOM focus logic.

## Options

### 1. Introduce JSDOM for client-side Vitest tests (Recommended)
Configure Vitest to use `jsdom` (or `happy-dom`) for tests specifically within `src/client/`. This allows us to instantiate client UI components, dispatch mock events, and assert on the resulting DOM state, classes, and ARIA attributes.
- **Pros:** Directly addresses the root cause of the XSS and ARIA bugs by making them testable. Standard ecosystem solution.
- **Cons:** Adds a heavy dependency. Tests involving JSDOM are slower than pure logic tests. Care must be taken to keep `src/engine/` tests isolated from DOM globals to maintain engine purity.

### 2. Isolate purely logical UI state from DOM updates
Refactor the client layer to adopt a strict Model-View pattern, where UI state (like focus, tab selection, and sanitized strings) is computed in pure functions, and a thin, untested DOM layer applies it.
- **Pros:** Keeps tests fast and dependency-free.
- **Cons:** Requires a massive rewrite of `src/client/systems/`. It still leaves the final DOM mapping untested, which is where escaping errors (like missing quotes in attributes) and ARIA misconfigurations often occur.

### 3. Do nothing (Status Quo)
Continue relying on TypeScript, manual QA, and UI reviews to catch DOM bugs.
- **Pros:** Zero configuration cost or migration effort.
- **Cons:** We will continue to see recurring XSS, ARIA, and focus management bugs. The `.jules` logs already prove that type-checking and manual review are insufficient to prevent these regressions, imposing an ongoing tax on human review time and player experience.

## Decision

Introduce JSDOM to enable unit testing for the client presentation layer. This is the most pragmatic way to prevent the recurring bugs documented in our learning logs.

## Consequences

- **What gets better:** We gain the ability to write regression tests for `innerHTML` escaping, focus management, and ARIA state transitions. We can programmatically verify that client UI components behave correctly and safely.
- **What gets worse:** We take on the maintenance and performance cost of JSDOM. Client tests will run slower than engine tests.
- **What becomes harder to change:** The Vitest configuration will become more complex, as we must ensure JSDOM globals do not leak into `src/engine/` tests (which strictly prohibit DOM dependencies). We may need workspace-level or directory-level test configurations.
- **Migration cost:** Low to medium. We need to install `jsdom`, configure Vitest to apply the environment to `src/client/**/*.test.ts`, and write the initial tests for the known bug vectors (e.g., `RetroModal`, `GameMenu`). Existing client code does not need to be rewritten, only tested.
