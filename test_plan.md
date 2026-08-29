1. **Optimize `processMagneticPickup` in `src/engine/systems/simulation/tick.ts`**
   - Replace the `for (const item of state.entities)` loop that filters for `EntityKind.ITEM` with a direct loop over `state.entityManager.items`.

2. **Optimize `processHoleFalls` in `src/engine/systems/simulation/tick.ts`**
   - Replace the `for (const entity of state.entities)` loop that filters for `EntityKind.ITEM` with a direct loop over `state.entityManager.items`.

3. **Optimize `processMonsterItemPickups` in `src/engine/systems/simulation/tick.ts`**
   - Refactor the combined loop that populates both `monsters` and `items` by doing a quick early exit check on `state.entityManager.items` before doing the single pass over `state.entities` to collect monsters. This avoids filtering items from the larger entity array completely.

4. **Add Bolt Journal Entry**
   - Record this performance learning in `.jules/bolt.md` if the optimization demonstrates avoiding unnecessary O(N) traversals on tick.

5. **Run test checks**
   - Run `npm run format`, `npm run type-check`, and `npm run test` immediately before the pre-commit phase to verify functionality and ensure no regressions.

6. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run `pre_commit_instructions` and follow the provided steps.

7. **Submit PR**
   - Create a PR titled "⚡ Bolt: O(1) entity to item filtering on per-tick events" explaining the measurable improvement.
