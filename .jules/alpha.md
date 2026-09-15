
## 2025-02-12 - Preserve resting state through saves and level transitions

**What was found:**
The `Game.deserialize`, `Game.attachExistingPlayer`, and `Game.applyLevelSnapshot` methods were explicitly clearing a player's `resting` and `restNextHealTick` state back to their defaults (`resting = false`, `restNextHealTick = undefined`). This meant that whenever a player transitioned between levels or saved and loaded the game while resting, their resting state was incorrectly aborted, causing the `preserves resting state through save/load` test to fail.

**Action:**
Removed the `player.resting = false` and `player.restNextHealTick = undefined` lines from `detachPlayer`, `attachExistingPlayer`, and `applyLevelSnapshot` in `src/engine/core/game.ts`. This allows the active resting state and the target heal tick to survive cleanly across serialization and level transitions, fixing the failing test and maintaining the expected game rules.

**Prevention:**
When modifying entity state schemas—especially transient, player-facing buffs, debuffs, or action states like resting—ensure that initialization logic or level transitions do not blindly clobber data that is correctly carried over by the serialization or level-transfer boundaries. If an action's state spans ticks and is intended to be durable, it should only be cleared by the systems managing its lifecycle (e.g., waking up on damage or input), not by generic state plumbing.
