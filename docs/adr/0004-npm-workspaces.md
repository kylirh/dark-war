# 0004 - NPM Workspaces for Build Variants

**Status:** Proposed
**Date:** 2026-09-15

## Context

Dark War is architected to support four distinct build variants (Electron desktop, Headless server, Static web client, and Arcade cabinet) from a single shared engine. `docs/ARCHITECTURE.md` explicitly forbids `src/engine/` from importing DOM, Pixi, Electron, `ws`, Node modules, or platform globals.

Currently, this constraint is enforced entirely by convention and a custom AST-parsing test (`src/engine-purity.test.ts`), rather than by structural boundaries. The entire project uses a single, monolithic `package.json` and a single `node_modules` directory.

The cost of this design is that the boundary is inherently porous during development. Developers routinely get auto-import suggestions for Node builtins (like `fs` or `path`) and DOM globals inside engine files because `tsconfig.json` includes `DOM` and `@types/node` globally. This leads to accidental violations that are only caught when `engine-purity.test.ts` runs. Furthermore, configuring Vite and esbuild to bundle different variants requires complex, manual path resolutions and externalizations (e.g., in `scripts/build-web.mjs` and the `esbuild` server step) instead of relying on standard Node package resolution.

## Options

### 1. Do nothing (Status Quo)

Maintain the monolithic repository structure. Rely on `src/engine-purity.test.ts` to catch violations and accept the tooling friction of mixed TypeScript environments in a single root.

**The case for this:** `docs/ARCHITECTURE.md` currently lists npm workspaces as "not an active roadmap item," considering it a packaging change rather than a prerequisite for world work. The current setup works, and the purity test successfully blocks regressions. Migrating to workspaces is a disruptive structural change.

### 2. Extract into NPM Workspaces

Reorganize the repository into formal npm workspaces (e.g., `packages/engine`, `packages/client`, `apps/electron`, `apps/server`, `apps/web`). Each package gets its own `package.json` and `tsconfig.json`.

**The case for this:** This structurally enforces the architecture boundaries. The engine package would not list `electron` or `ws` in its dependencies, and its `tsconfig.json` would exclude `DOM` and `@types/node`. Auto-imports would work correctly. `engine-purity.test.ts` could be deleted. Build tools for each app variant would only see the dependencies they actually need, dramatically simplifying the build scripts.

## Decision

We recommend **Option 2: Extract into NPM Workspaces**.

While the current setup works, the friction of fighting the IDE (erroneous auto-imports, mixed DOM/Node typings) imposes a continuous tax on development. The custom purity test is a symptom of a missing structural boundary. Workspaces are the standard ecosystem solution for this exact problem, and adopting them will align the project's physical structure with its documented architectural intent.

## Consequences

- **What gets better:** IDEs will provide correct auto-completion and typing per-module (no DOM in engine, no Node built-ins in the web client). We can delete `src/engine-purity.test.ts`. Build configuration becomes simpler and standard.
- **What gets worse:** Dependency management becomes slightly more verbose, as dependencies must be added to specific workspaces rather than the root `package.json`. Cross-package refactoring can sometimes require rebuilding references.
- **What becomes harder to change:** Global scripts (like the asset compiler) may need to be adjusted to resolve paths relative to the workspace root or their specific package.
- **Migration cost:** Medium. It requires moving files, splitting `package.json` and `tsconfig.json`, and updating import paths across the codebase. However, because `engine-purity.test.ts` has kept the engine clean, the code itself should not require logical changes.
