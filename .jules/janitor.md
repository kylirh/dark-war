## 2026-09-01 - Unused exports in configuration and constants

**What was found:** Several constants and functions exported from utility, configuration, and constant files were entirely unused throughout the codebase. Specifically, `getMultiplayerModeFromUrl` in `src/engine/utils/multiplayer.ts`, `SPRITES_PER_ROW` in `src/engine/config/sprites.ts`, and `UTILITY_BOT_REPAIR_SEARCH_RADIUS` in `src/engine/systems/simulation/constants.ts` had no internal importers.

**Action:** Removed the unused exports entirely.

**Prevention:** Periodically use a custom script or a tool like `ts-prune` to scan for unused exports across the codebase. Be careful to use exact word boundary matching (`\b`) when confirming via grep to avoid false positives (e.g. partial variable name matches).

## 2026-09-06 - Unused exports and dead code

**What was found:** `knip` reported numerous unused exports (like `VOLUME_STEP_PERCENT`, `SAVE_CHARACTER_NAME`, `encodePNG`) across multiple files that were only used internally. The `DROP_LOOT` enum and GameEvent type union was also found to be completely unused via grep.

**Action:** Removed the `export` keyword from locally used variables and functions to encapsulate them properly. Removed `MIN_VISIBLE_FRACTION` from `module.exports` in `electron/window-state.js`. Deleted the dead `DROP_LOOT` enum member and its type variant.

**Prevention:** Use a tool like `knip` or `ts-prune` periodically to identify and remove unused exports and dead code. Wait to export a function or variable until it is actually needed by an external module.

## 2026-09-17 - Consolidate duplicate render logic and tests

**What was found:** `renderDecoration` in `src/client/systems/renderer.ts` was almost entirely identical to `renderDepthTile`, duplicating identical logic for shadows, glow, FOV alpha, and sprite construction. Also, `use-item.test.ts` contained 2 large test setups which were duplicated across tests.

**Action:** Replaced the body of `renderDecoration` with a simple call to `renderDepthTile(key, undefined, depthOffset, glow)`. Created a common test setup helper function `setupTestGame()` for `use-item.test.ts` and called it for the duplicates.

**Prevention:** Use `jscpd` regularly to surface block duplication and collapse identical inline functions. When multiple UI elements or items have similar rendering needs, look for opportunities to compose existing render primitives instead of repeating the implementation.

## 2026-09-19 - Consolidate deterministic command sorting

**What was found:** `src/engine/systems/simulation/tick.ts` contained a proven duplicate block of logic (identified by `jscpd`) used to deterministically sort both `playerCommands` and `aiCommands` based on `priority`, `actorId`, and `id`.

**Action:** Extracted the duplicate sorting logic into a new, reusable `sortCommandsDeterministically(commands: Command[])` helper function at the bottom of the file, and updated both call sites to use it.

**Prevention:** Use `jscpd` regularly to surface block duplication and collapse identical inline functions or test setups. Ignore duplicates inside `src/generated/`.

## 2026-09-20 - Consolidate duplicate dog test setups

**What was found:** \`src/engine/systems/simulation/pets.test.ts\` contained a significant amount of duplicated test setup code for initializing the game, clearing monsters, and spawning a \`WILD_DOG\` entity across multiple test cases.

**Action:** Created a reusable \`setupDogTest(isFriendly = true)\` helper function to encapsulate the repeated game setup logic, and replaced the duplicated blocks in the test cases with calls to this helper.

**Prevention:** Use \`jscpd\` regularly to surface block duplication and collapse identical inline functions or test setups. Ignore duplicates inside \`src/generated/\`. When identifying duplicated lines using \`jscpd\`, always inspect the exact line ranges using \`sed\` before applying changes, to ensure precise understanding of the code being replaced.

## 2025-02-23 - Consolidate commands and test duplication

**What was found:** Two independent sets of duplication were identified using `npx jscpd`. First, `resolveAscendCommand` and `resolveDescendCommand` in `src/engine/systems/simulation/commands.ts` had identical player-checking and portal lookup logic. Second, `src/engine/systems/simulation/use-item.test.ts` had numerous large duplicated blocks around game state setup for melee attacks and reloading edge cases.

**Action:** Extracted the portal lookup block into a new helper function `getTransitionPortal` in `commands.ts` which reduced size and improved single-responsibility. In `use-item.test.ts`, extracted `setupDeadPlayer`, `setupReloadTest`, and `setupMeleeTarget` helpers, drastically reducing test setup boilerplate and cutting the duplication report down to zero inside that file.

**Prevention:** Run `npx jscpd` proactively on modified files before submitting to catch duplicated logic blocks.

## 2026-09-30 - Consolidate duplicate game state initialization logic

**What was found:** `src/engine/core/game.ts` contained a significant block of duplicated boilerplate logic (approx. 20 lines) for instantiating the core arrays, objects, and simulation fields of `GameState`. This exact block was repeated three times: in `createInitialState`, in `reset`, and again when loading a save in `deserialize`.

**Action:** Extracted the duplicated initialization block into a new private helper `createBaseState(localPlayerId: string)`, plus a `createBaseSim()` helper for the simulation fields, and used object spread syntax to apply them in all three methods.

**Reviewer correction:** the helper's return type is an explicit `Pick<GameState, ...>` naming the fifteen fields it owns, not `Partial<GameState>`. `Partial` would be the wrong choice here: it makes every field optional, so the three call-site object literals would no longer be checked for completeness and a missing `GameState` field would type-check. `Pick` keeps that check intact.

**Prevention:** Use tools like `jscpd` to proactively identify and collapse duplicated boilerplate when initializing large state objects, especially before modifying state initialization routines.

## 2026-10-01 - Consolidate duplicate test setups for items and vending machines

**What was found:** `src/engine/systems/simulation/monster-pickup.test.ts` and `src/engine/systems/simulation/panic-vending.test.ts` contained repeated game setup boilerplate (e.g. `new Game`, `game.reset(1)`, `clearMonsters`) and repeated complex interactions like spawning an item entity and enqueuing an `INTERACT` command across multiple `it` blocks. This was discovered via `jscpd`.

**Action:** Extracted the duplicated boilerplate into `setupPickupTest()` inside
`monster-pickup.test.ts` (13 call sites), and the vending machine sequence into
`interactVendingMachine(game, player)` inside `panic-vending.test.ts` (3 call sites).

**Reviewer correction:** the vending helper originally re-implemented the body of the
`interact(game, x, y)` helper already sitting ten lines above it in the same file —
a second copy of the enqueue-and-step block, introduced by a change whose whole
purpose was removing copies. It now spawns the machine and delegates to `interact`,
which is the extraction the duplication actually called for. Its `Player` import had
also been added in the middle of the file rather than to the existing `../../types`
import at the top, and neither new helper declared a return type, which the file's
own `interact` and `dropItemOn` both do.

**Prevention:** Run `npx jscpd` proactively to detect block-level duplications, and extract generic test initialization or repetitive entity creation steps into scoped helper functions when writing new tests or refactoring.

## 2026-10-02 - Consolidate duplicated test setup in matter manipulator

**What was found:** The test file `src/engine/systems/simulation/matter-manipulator.test.ts` repeated the same six-line setup block — `new Game`, `game.reset(1)`, `getState`, `hasMatterManipulator = true`, and the `gridX + 1` target cell — across ten `it` blocks. Discovered via `jscpd`.

**Action:** Extracted it into a `setupMatterManipulatorTest()` helper returning `{ game, state, tileX, tileY }`. Net effect against `main`: 33 insertions, 63 deletions.

**Reviewer correction:** the helper was declared without a return type, which this log's 2026-10-01 entry had already called out on the previous pair of extracted helpers — the file's own `interact` and `dropItemOn` both declare one. It now returns an explicit shape. The first pass also converted only six of the ten identical call sites: three differed from the extracted block by a single `itemCounts` line, and one was the parameterized workshop test that landed in #334 while this was open. All ten now use the helper. The six blocks left alone genuinely differ: two derive their target from `wallBesidePlayer`, two call `game.reset(0)` for the surface, one sets `hasMatterManipulator = false` because that is the behaviour under test, and one aims at `gridX + 40` to land outside manipulator reach.

**Prevention:** Declare a return type on every extracted helper — this is now the second entry correcting the same omission. When a duplicated block is followed by one differing line, the differing line belongs at the call site, not in a second copy of the block. And finish the sweep: count the matching call sites before extracting, so a consolidation does not leave near-identical copies behind.

## 2026-10-03 - Consolidate duplicate item consumption logic

**What was found:** The "decrement a counted item, clear the inventory slot once it hits zero" block existed **five** times, not two. Three were named helpers and two were inline:

| site                                                                 | shape                                          |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `commands.ts` `consumeOne(player, type)`                             | fixed amount of 1                              |
| `events.ts` `takePlayerItem(player, type)`                           | fixed amount of 1, byte-identical to the above |
| `conversation.ts` `consumeCountedItem(player, itemType, amount = 1)` | already parameterized                          |
| `commands.ts` `buyFromVending`                                       | inline, `amount = VENDING_COST`                |
| `events.ts` `stealFromPlayer` money arm                              | inline, `amount = taken`                       |

**Action:** One exported `consumeItem(player, itemType, amount = 1)` in `inventory.ts`; all five sites call it. `conversation.ts` already had the general form, so the signature is its signature — the two amount-of-1 helpers are its default case and the two inline blocks are the amount-bearing case. `removeFromInventory` became unused in `events.ts` and `conversation.ts` and was dropped from both imports.

The dialogue effect that reaches the `conversation.ts` site is itself called `consumeItem` (`dialogue-defs.ts`), so the shared helper now carries the name the content layer already used.

Each of the five sites was separately covered before the change: dropping the slot clear at any one of them failed exactly one test. After consolidation the same mutation on the single helper fails 5 tests across 5 files, so nothing lost its coverage.

**Prevention:** This log's previous entry already ends with "finish the sweep: count the matching call sites before extracting", and the first pass here still stopped at the two that happened to be identical **functions**. Grep for the _body_ of the duplicated block, not for a helper name — the two sites missed were inline code with no name to find, and the third was a generalization of the same block that a name search for `consumeOne` would never reach. When one copy already takes a parameter the others hard-code, that copy is the signature to extract.
