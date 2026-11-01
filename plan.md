1. **Goal:** Deduplicate the wait command generation in `src/engine/systems/simulation/ai.ts`.
2. **Oracle:** Duplication - `makeWaitCommand` exists in `sim-helpers.ts` and is imported in `ai.ts`, but `ai.ts` still manually constructs a wait command object (lines 1940-1948). We can replace the manual object construction with the `makeWaitCommand(monster, tick)` helper function.
3. **Changes:**
   - In `src/engine/systems/simulation/ai.ts` at the end of the file, replace:
     ```typescript
     return {
       id: crypto.randomUUID(),
       tick,
       actorId: monster.id,
       type: CommandType.WAIT,
       data: { type: "WAIT" },
       priority: 0,
       source: "AI",
     };
     ```
     with `return makeWaitCommand(monster, tick);`
4. **Verification:** run `npm run format:check && npm test && npm run type-check && npm run build:ts && git diff --check`
5. **Pre-commit steps:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit:** Open a PR with the change.
