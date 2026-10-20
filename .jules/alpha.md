## 2024-05-23 - Death transition cancellation

**What was found:** If lethal damage triggers a cascade that exceeds MAX_EVENTS_PER_TICK, the PLAYER_DEATH event is deferred to the next tick. The tick ends with the player dead but transition flags (shouldDescend/shouldAscend) still true, which causes the host to execute the level transition while the player is dead.

**Action:** Immediately clear transition flags in processDamageEvent when the player's HP reaches 0, rather than waiting for the deferred PLAYER_DEATH event to be processed.

**Prevention:** When adding immediate consequences of death (like stopping movement), also ensure that any pending transitions or operations that must not occur while dead are cancelled eagerly, before the event queue processes.
