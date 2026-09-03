1. **Analyze the testing gap**:
The `canTalkTo(entity)` function in `src/engine/systems/simulation/social.ts` checks if an entity has a `social` component, an `interactable` component, and if `interactable.affordances.includes("talk")`.
There is currently no direct test for this small pure function in `social.test.ts`.

2. **Implement test**:
Add a `describe("canTalkTo", () => { ... })` block in `src/engine/systems/simulation/social.test.ts`.
Create test cases for:
- Returns `true` when all conditions are met (`social`, `interactable`, and `affordances` includes `"talk"`).
- Returns `false` if `social` is missing.
- Returns `false` if `interactable` is missing.
- Returns `false` if `"talk"` is not in `affordances`.

Since the function just takes an `Entity` object and does boolean checks on its properties, we can simply mock a minimal `Entity` object in the test using type assertions like `as Entity`.

3. **Verify**:
Run the tests using `npx vitest run src/engine/systems/simulation/social.test.ts` to ensure the new tests pass and catch regressions.

4. **Pre-commit and submit**:
Run full tests, formatting, type check, etc.
Submit PR for testing improvement.
