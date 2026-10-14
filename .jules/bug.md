## 2026-10-02 - Cancel level transitions upon player death

**What was found:** `shouldDescend` / `shouldAscend` are set while commands
resolve in step 1 of `stepSimulationTick`, but the host consumes them only after
the tick ends (`src/client/main.ts:1616-1634`). `processEventQueue` runs in
between (step 4), so any damage event that lands in the same tick — a monster's
melee, an explosive detonating, a hole fall — could kill the player after the
transition was already committed. The host then ran `Game.descend()` /
`Game.ascend()` for a dead player.

**Action:** `processPlayerDeathEvent` in
`src/engine/systems/simulation/events.ts` now clears `shouldDescend`,
`shouldAscend`, `descendTarget`, and `pendingPortalId`. Covered by
`death-transition.test.ts` for the descend, ascend, and lethal-hole-fall paths;
each of the four cleared fields fails a test when dropped individually.

**Scope note:** the shared flags are an offline-only mechanism. The multiplayer
server clears both after every tick (`server/multiplayer-server.ts:880-883`)
because per-player migration is handled by the room, so this cannot cancel
another player's transition.

**Prevention:** Always consider the state invalidation effects of actor death on
pending actions or delayed transitions. Any state flags set by a command that
are evaluated later in the tick (or after the tick) must be aborted if the actor
dies in the interim.

## 2026-10-14 - sort ai commands before truncating

**What was found:** In \`stepSimulationTick\`, the engine truncated generated AI commands to \`MAX_COMMANDS_PER_TICK\` before sorting them. This meant that overflow silently dropped the lowest-generated commands rather than the lowest-priority ones, violating the intent of the safety limit documented in ADR 0009.

**Action:** Swapped the order of truncation and \`sortCommandsDeterministically\` in \`src/engine/systems/simulation/tick.ts\` so that AI commands are sorted first. Added a test in \`src/engine/systems/simulation/tick.test.ts\` to verify high-priority commands survive truncation while low-priority ones are dropped.

**Prevention:** When enforcing safety limits by truncating an array of ordered operations, always sort the array before truncating to ensure that the least important items are dropped, rather than items determined by generation order.
