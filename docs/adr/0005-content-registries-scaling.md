# 0005 - Content Registries Scaling

**Status:** Proposed
**Date:** 2026-09-19

## Context

The game's content definitions—such as monsters, items, blocks, and dialogue—are currently authored as monolithic TypeScript records in `src/engine/content/`. For example, `src/engine/content/dialogue-defs.ts` contains the entire script of the game as a single object literal, and `monster-defs.ts` lists every creature's stats and archetype.

This approach is under significant pressure as the game's content grows:

- **Relational Integrity is Unenforceable:** The TypeScript interface cannot express relational invariants. As explicitly documented in `src/engine/content/dialogue-defs.test.ts`: *"DIALOGUE_DEFS is hand-authored data compiled to a runtime graph, and the TypeScript interface cannot express the invariants that matter: that links resolve, that choice ids are unique, that no node is stranded, and that every graph is actually reachable from a social def."* We are currently relying on heavy unit tests to act as makeshift integrity checkers for static data.
- **Merge Conflicts:** A single `dialogue-defs.ts` file acts as a bottleneck. Multiple content additions concurrently modifying this file will inevitably cause merge conflicts.
- **Bundle Bloat:** All content is eagerly loaded into the engine bundle, meaning the entire game's dialogue and item database must be parsed by the client before the main menu can open.

The current design scales poorly for relational data and tightly couples content authoring to source code compilation.

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

It directly addresses the relational integrity shortcomings of TypeScript while avoiding the heavy runtime dependency of Option 3. It mirrors the existing, proven asset pipeline for visual content. By moving the structural validation from Vitest into a compiler, we guarantee that invalid data cannot even be built, let alone shipped, and we resolve the merge friction of monolithic TypeScript files.

## Consequences

- **What gets better:** Content authors can work in isolated files without conflicting with code changes. Relational invariants (like dialogue links) are enforced at compile time. The engine source code is decoupled from raw game text and tuning data.
- **What gets worse:** Content authors lose inline TypeScript autocomplete for complex objects (unless we provide robust JSON Schemas). We take on the complexity of extending the asset compiler.
- **What becomes harder to change:** The structure of a dialogue node or item definition will require updating both the schema/compiler and the engine consumer, rather than just changing a TypeScript interface.
- **Migration cost:** Medium. We must write a parser/validator for the new format, migrate all existing records in `src/engine/content/` to the new data format, and update the engine to load the compiled manifest at startup rather than importing static objects.
