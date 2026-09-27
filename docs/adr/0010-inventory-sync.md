# 0010 - Inventory Sync Boundaries

**Status:** Proposed
**Date:** 2026-09-27

## Context

The `Player` state currently tracks stackable inventory items using two distinct data structures: `inventorySlots` (an array defining which slot an item occupies) and `itemCounts` (a record mapping `ItemType` to integer quantities).

A critical boundary exists when an item is consumed or removed entirely. When `itemCounts[ItemType]` reaches zero, the system must perform two synchronized mutations: `delete player.itemCounts[type]` and `removeFromInventory(player, type)`.

Because this boundary cannot be structurally expressed by the `GameState` types, it is maintained entirely by convention and scattered conditionals. As a result, the logic frequently drifts. The `.jules/test.md` learning log documents two recurring failures stemming from this exact seam:
- **2026-09-18:** "Vending machine exact coin deduction. The branch... is responsible for deleting the coin entry from the player's item counts and inventory if exactly VENDING_COST coins are spent. This edge case of having exactly enough coins was not covered by any existing test, making it vulnerable to regressions where exact spends might leave a 0-count item in the inventory."
- **2026-09-20:** "Exact coin deduction during Moppet theft. The branch `if (left <= 0)` in `events.ts:stealFromPlayer()` for money theft clears the player's inventory slot when a moppet steals all their coins. This branch lacked test coverage."

The design is under real pressure here. Any new system that deducts items (e.g. trading, crafting, or consumption) requires the developer to perfectly reproduce the manual sync logic (e.g. `if (remaining <= 0) { delete...; removeFromInventory... } else { ... }`), leading to a recurring bug class where UI or logic breaks due to 0-count ghost items.

## Options

### 1. Do nothing (Status Quo)

Continue relying on test coverage and developer memory to maintain the synchronization between `itemCounts` and `inventorySlots`.

**The case for this:** The system currently works, and we have recently added test coverage for the exact-deduction edge cases. Separating the slot index from the quantity keeps the runtime data flat and simplifies networking and persistence. Zero migration effort is required.

### 2. Merge counts into inventory slots

Change the `InventorySlot` interface from `{ type: ItemType | null }` to `{ type: ItemType | null, count: number }`, deleting the `itemCounts` record entirely.

**The case for this:** It structurally enforces synchronization: an item's existence and its quantity are stored in the same place. If a slot is cleared to `null`, its count is intrinsically gone.
**The case against:** It changes how items stack in the inventory, potentially forcing a max stack size or unlimited stacks inside the slot, and complicates the serialization boundary. Finding the total count of an item would require iterating over all slots instead of a single object lookup.

### 3. Extract an Inventory Manager

Keep the underlying `inventorySlots` and `itemCounts` flat for serialization, but hide them behind an `InventoryManager` or utility functions that strictly control mutation. All simulation code must use `inventory.consume(ItemType, amount)` which internally handles the `remaining <= 0` synchronization.

**The case for this:** It structurally prevents the bug class without changing the serialized state format. The compiler enforces that simulation systems cannot mutate `itemCounts` directly, forcing them through the safe, managed boundary. This aligns with ADR 0003 (GameState Ownership) which recommends extracting state repositories to prevent desyncs.

## Decision

We recommend **Option 3: Extract an Inventory Manager**.

While adding tests for specific missing branches (Option 1) patches the current holes, it does not stop the bug class from recurring when new deduction mechanics are added. Option 2 introduces significant structural changes to serialization and item lookup performance. Option 3 solves the problem by encapsulating the error-prone synchronization logic into a single trusted boundary without disturbing the underlying data shape.

## Consequences

- **What gets better:** The recurring bug class of 0-count ghost items is structurally eliminated. Developers no longer need to write boilerplate conditionals for every item deduction.
- **What gets worse:** Simulation systems must be updated to call the new manager/utility methods rather than mutating item counts directly, making simple assignments slightly more verbose.
- **What becomes harder to change:** Any custom logic that bypasses standard item deduction rules will need to be explicitly supported by the manager's API rather than just modifying the underlying record.
- **Migration cost:** Low to Medium. We must create the unified mutation methods and refactor existing inline deduplication logic across `commands.ts`, `events.ts`, and `conversation.ts` to use them.
