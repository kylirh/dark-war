# 0002 - Npm Workspaces

**Status:** Proposed
**Date:** 2026-09-01

## Context

The repository currently maintains separate directories (`src/engine/`, `src/client/`, `server/`, `electron/`, `apps/`) serving as implicit package boundaries. `docs/ARCHITECTURE.md` describes these boundaries and enforces them via `src/engine-purity.test.ts`. However, it explicitly states: "Moving them into npm workspaces is not an active roadmap item; it would be a packaging change rather than a prerequisite for the world work."

The cost of this current design is that boundaries are enforced by convention and a custom test, rather than standard package manager features. Tooling like TypeScript and ESLint requires complex configurations to respect these boundaries, and sharing dependencies requires a monolithic `package.json` that mixes frontend (`pixi.js`, `vite`), backend (`ws`), and engine (`detect-collisions`) concerns, increasing installation times and the risk of accidental imports. A change requires edits in several unrelated places, traced through git log.

## Options

1. **Do nothing**
   Keep the single root `package.json` and rely on `src/engine-purity.test.ts` to enforce the boundary. The cost is maintaining a sprawling `tsconfig` graph, mixing dependencies, and increasing the cognitive load for new developers who must learn custom conventions instead of standard npm workspace rules.

2. **Adopt npm workspaces**
   Refactor the root directory structure to use standard npm workspaces (e.g., `packages/engine`, `packages/client`, `packages/server`, `apps/web`, `apps/electron`). Each workspace gets its own `package.json` declaring exactly its dependencies. `engine-purity.test.ts` becomes unnecessary because `packages/engine/package.json` will simply not include DOM, Pixi, or Node types.

## Decision

We recommend **Option 2: Adopt npm workspaces**.

While it is true that this is a "packaging change rather than a prerequisite for the world work," the foundation program (M0-M8) is now marked COMPLETE in the roadmap. The project is moving towards product expansion, and the monolithic package setup will become increasingly fragile as more build variants and platform-specific dependencies are added. Adopting workspaces formalizes the architectural boundaries documented in `ARCHITECTURE.md` into physical tooling constraints.

## Consequences

- The `package.json` is split up, so `engine` will definitively lack Pixi and DOM types, catching purity violations instantly in the IDE rather than via a custom test.
- The build pipeline needs to be updated to run commands across workspaces.
- Migration cost is moderate: it requires moving files, splitting configurations, and updating CI/CD scripts.
- It becomes slightly harder to run ad-hoc scripts from the root without using `npm --workspace` flags.
