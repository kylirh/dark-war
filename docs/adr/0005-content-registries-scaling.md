# 0005 - Content Registries Scaling

**Status:** Proposed
**Date:** 2026-09-19

## Context

The game's content definitions—such as monsters, items, blocks, and dialogue—are currently authored as TypeScript records in `src/engine/content/`. `src/engine/content/dialogue-defs.ts` holds every dialogue graph as a single object literal, and `monster-defs.ts` lists every creature's stats and archetype.

One concrete cost is being paid today; two more are anticipated as content grows:

- **Relational Integrity is Unenforceable:** The TypeScript interface cannot express relational invariants. As explicitly documented in `src/engine/content/dialogue-defs.test.ts`: _"DIALOGUE_DEFS is hand-authored data compiled to a runtime graph, and the TypeScript interface cannot express the invariants that matter: that links resolve, that choice ids are unique, that no node is stranded, and that every graph is actually reachable from a social def."_ We are currently relying on heavy unit tests to act as makeshift integrity checkers for static data.
- **Single-File Authoring (anticipated, not yet observed):** All dialogue lives in one file, so concurrent content work would contend on it. This is a projected cost rather than a current one: `git log --follow src/engine/content/dialogue-defs.ts` shows a single commit touching it to date, and no conflict has actually occurred. It should not on its own justify a migration.
- **Bundle Size (currently negligible):** All content is eagerly loaded into the engine bundle. At present this is not a real cost — `dialogue-defs.ts` is 9 KB, `monster-defs.ts` 7 KB and `item-defs.ts` 6 KB, against a 972 KB `app/game.js`, so content is under 3% of the bundle. Recorded only as something that scales with content volume, not as evidence for acting now.

The load-bearing cost is therefore the first one: a relational invariant the type system cannot express, currently held together by hand-written tests. The other two are recorded for completeness and are not yet real.

## Options

### 1. Do nothing

Keep authoring content as TypeScript records in `src/engine/content/`. Continue adding unit tests to enforce relational integrity.

**The case for this:** It is simple and currently works. Contributors do not need to learn a new data format or tooling; they get standard autocomplete and type-checking in their IDE. It requires zero migration effort.

### 2. Extract Data into JSON/YAML with a Build-Time Compiler

Migrate content definitions (like dialogue, items, and monsters) into discrete data files (e.g., `assets-src/content/**/*.yaml` or `.json`). Extend the existing asset compiler (`tools/asset-compiler.mjs`) to parse, validate relational integrity (e.g., asserting node links resolve), and compile these files into an optimized runtime format (like a single compressed manifest or SQLite database), similar to how visual assets are currently processed.

**The case for this:** This separates content from code. It allows validation logic to run as a dedicated build step rather than repurposing Vitest as an integrity checker. Splitting data into discrete files eliminates the single-file merge conflict bottleneck. This pattern directly aligns with the successful `assets-src/` architecture already in place for visual/Tiled assets.

### 3. Move Content into a Runtime Relational Database

Migrate the definitions into a SQL database (e.g., SQLite) distributed with the server, with the client downloading only the content definitions it currently needs to render.

**The case for this:** It natively solves relational integrity (foreign keys) and bundle size. However, it violates the constraint that the game is offline-capable out of the box with the exact same engine, as the static web client cannot easily bundle or query a full server-side SQL database synchronously in the current architecture without major refactoring.

## Decision

We recommend **Option 2: Extract Data into JSON/YAML with a Build-Time Compiler**.

It directly addresses the relational integrity shortcoming of TypeScript while avoiding the heavy runtime dependency of Option 3. It mirrors the existing, proven asset pipeline for visual content. By moving the structural validation from Vitest into a compiler, invalid data cannot be built, let alone shipped.

This recommendation rests on the relational-integrity cost alone. Given the current content volume, Option 1 remains defensible, and the timing question — whether this is worth doing now or once content volume actually grows — is left to a human.

## Consequences

- **What gets better:** Content authors can work in isolated files without conflicting with code changes. Relational invariants (like dialogue links) are enforced at compile time. The engine source code is decoupled from raw game text and tuning data.
- **What gets worse:** Content authors lose inline TypeScript autocomplete for complex objects (unless we provide robust JSON Schemas). We take on the complexity of extending the asset compiler.
- **What becomes harder to change:** The structure of a dialogue node or item definition will require updating both the schema/compiler and the engine consumer, rather than just changing a TypeScript interface.
- **Migration cost:** Medium. We must write a parser/validator for the new format, migrate all existing records in `src/engine/content/` to the new data format, and update the engine to load the compiled manifest at startup rather than importing static objects.
