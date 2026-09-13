# 0004 - npm Workspaces for Build Variants

**Status:** Proposed
**Date:** 2026-09-13

## Context

Dark War's core logic is shared across four build variants (Electron desktop, headless server, static web client, and an arcade cabinet scaffold). As defined in `docs/ARCHITECTURE.md`, a critical non-negotiable constraint is that `src/engine/` must not import DOM, Pixi, Electron, `ws`, Node modules, or platform globals.

Currently, this constraint is not enforced structurally through package boundaries. Instead, everything lives in a single top-level package. The engine purity boundary is maintained entirely by convention and a bespoke custom regex parser in `src/engine-purity.test.ts`, which scans source files to forbid `pixi.js`, `electron`, `ws`, and Node builtins.

The concrete cost this imposes is that developer tooling is unaware of this boundary. IDE auto-imports routinely suggest invalid dependencies inside `src/engine/` (e.g. suggesting `import { path } from 'node:path'`). It places the burden on developers to manually adhere to a boundary that only fails later when the test suite runs.

The architectural constraint states: "Moving them into npm workspaces is not an active roadmap item; it would be a packaging change rather than a prerequisite for the world work." However, according to `docs/ROADMAP.md`, the world work foundation (Milestone 0-8) is now completely finished. The prerequisite argument for deferring this change is no longer applicable.

## Options

### 1. Do nothing (Status Quo)

Keep the entire project in a single package. The `src/engine-purity.test.ts` continues to enforce the rule via string-scanning regex tests.

- **The case for this:** It requires zero migration effort and build scripts remain as they are. The regex tests, although hacky, have successfully caught violations up to this point.

### 2. Move build variants and engine into npm workspaces

Extract `src/engine/` into its own package (`packages/engine`), and separate the client and server components into their respective packages (`packages/client`, `packages/server`).

- **The case for this:** It provides strict, structural isolation. `packages/engine`'s own `package.json` simply wouldn't list `pixi.js` or `ws` as dependencies, and its `tsconfig.json` wouldn't include Node or DOM types. The TypeScript compiler and the IDE would naturally prevent these imports before code is even written, eliminating the need for bespoke regex parsing tests. It correctly models the architecture that already exists conceptually.

## Decision

We recommend **Option 2: Move build variants and engine into npm workspaces**.

Since the world foundation work is complete, the original reason for deferring this structural lift no longer applies. Enforcing strict boundary separation through actual package constraints eliminates friction with IDEs and leverages standard npm/TypeScript ecosystem tools rather than maintaining custom linting scripts.

## Consequences

- **What gets better:** IDEs will no longer suggest invalid imports in the engine. Strict structural decoupling is enforced by the compiler and package manager, not just a custom test. We can delete `src/engine-purity.test.ts`.
- **What gets worse:** The build configuration becomes more complex. Scripts in the root `package.json` will need to coordinate builds across workspaces (e.g. `npm --workspaces run build`).
- **What becomes harder to change:** Inter-package dependencies become explicit. If an engine module incorrectly assumes a client utility should be available, it can't just casually import it; the package boundaries will force developers to properly inject those dependencies or reconsider the design.
- **Migration cost:** Moderate. Moving files into new `packages/*` directories is mostly a mechanical refactoring, but updating the Vite/esbuild configurations, TS configs, and CI pipeline to understand the workspace layout requires careful alignment.
