
## 2024-10-02 - Cancel level transitions upon player death

**What was found:** A bug where if a player initiated a level transition (`DESCEND` or `ASCEND`) and then died within the same simulation tick (e.g., from delayed explosion damage processed in the event queue), the pending transition flags (`shouldDescend`, `shouldAscend`) were not cleared. This caused the game to erroneously process a level transition for a dead player at the end of the tick.

**Action:** Updated `processPlayerDeathEvent` in `src/engine/systems/simulation/events.ts` to explicitly clear pending level transitions by setting `state.shouldDescend = false`, `state.shouldAscend = false`, `state.descendTarget = undefined`, and `state.pendingPortalId = undefined` when the player dies.

**Prevention:** Always consider the state invalidation effects of actor death on pending actions or delayed transitions. Any state flags set by a command (like `shouldDescend`) that are evaluated later in the tick (or after the tick) must be aborted if the actor dies in the interim.
