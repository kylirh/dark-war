# 0005 - Content Registry Scaling

**Status:** Proposed
**Date:** 2026-09-18

## Context

Adding new content to Dark War (like items, monsters, or tile types) requires declaring members in central enums within `src/engine/types.ts` (`ItemType`, `MonsterType`, `TileType`, `WeaponType`).

The current architecture imposes a concrete cost on development:
- `src/engine/types.ts` is the most imported file in the codebase. Every time a single ordinary content piece (e.g., a new "Laser Pistol" or "Giant Spider") is added, the `types.ts` file changes, which invalidates the compilation cache and rebuilds the entire project.
- Content additions create frequent merge conflicts in `types.ts` when multiple branches add new items or monsters concurrently, as seen in `main` branch activity.
- The `types.ts` enums are heavily referenced in standalone lookup dictionaries (e.g., `ITEM_DEFS` in `src/engine/content/item-defs.ts`, `MONSTER_DEFS` in `src/engine/content/monster-defs.ts`). This splits the definition of a single entity across the system, requiring edits in `types.ts` and the respective `-defs.ts` registry.

As Dark War moves out of the prototype foundation and into the "ordinary game content and product expansion" phase (per `docs/ROADMAP.md`), the friction of the central enum boundary will scale directly with the amount of new content, imposing an escalating cost on iteration speed.

## Options

### 1. Do nothing (Status Quo)

Continue using central string enums in `src/engine/types.ts` for all content types.

**The case for this:** The enums currently serve as a robust, compiler-enforced index. When a new item is added to `ItemType`, the TypeScript compiler flags everywhere an exhaustive `switch` or `Record<ItemType, ...>` is used (e.g. `ITEM_DEFS`, serialization), forcing the developer to handle the new content. This safety net currently prevents runtime "unknown item" errors.

### 2. Extract Data-Driven Registries and Union Types

Remove `ItemType`, `MonsterType`, and similar enums from `src/engine/types.ts`. Instead, define the content definition keys inline as string literals in their respective data dictionaries (e.g., in `item-defs.ts`), and derive the type using TypeScript's `keyof typeof ITEM_DEFS`. The type can be exported directly from the definition module.

**The case for this:** A new item or monster only requires editing its specific `-defs.ts` file. `types.ts` remains static, avoiding global compilation cache invalidation. Concurrent PRs adding content to different files or different ends of a registry no longer conflict on a central enum block.

### 3. Use Branded Strings

Replace the enums in `types.ts` with branded string types (e.g., `type ItemType = string & { readonly __brand: unique symbol }`). Systems cast literal strings to the branded type.

**The case for this:** This decouples `types.ts` completely from the content, allowing new items to be defined without modifying the core types file, while still maintaining some type safety over raw strings in function signatures.

## Decision

We recommend **Option 2: Extract Data-Driven Registries and Union Types**.

While Option 1 provides excellent exhaustive checking, it centralizes all content into a single file that was never meant to be a content database. Option 2 preserves the exhaustiveness checking (a `Record<ItemType, ...>` still requires all keys if `ItemType` is a derived union) while successfully decentralizing the authoring process. The cost of maintaining a central enum outweighs the benefits now that the engine architecture is proven and the focus shifts to content expansion.

## Consequences

- **What gets better:** Adding new items, monsters, or tiles requires modifying only their respective data files. Merge conflicts on content addition drop significantly. Hot module replacement and compilation times improve.
- **What gets worse:** `keyof typeof` can create slightly more opaque error messages when type mismatches occur, compared to a formal `enum`. Circular dependency risks increase slightly if definitions import back into `types.ts`, requiring careful file structuring.
- **What becomes harder to change:** Any exhaustive switch statement that previously matched on `ItemType.MEDKIT` will now match on the literal `"medkit"`, requiring refactoring across the codebase to remove enum references.
- **Migration cost:** High. Every reference to `ItemType.SOMETHING` across the codebase must be converted to the string literal `"something"`. `types.ts` must be untangled from the `-defs.ts` files to break the current cycle where `types.ts` exports the enum and `-defs.ts` imports it to define the map.
