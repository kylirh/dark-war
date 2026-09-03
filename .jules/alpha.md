
## 2024-05-18 - Wake resting players on any command

**What was found:** According to `docs/HEALTH-AND-REST.md`, resting should be interrupted by "any damage or wake command". However, in `src/engine/systems/simulation/commands.ts`, non-`WAIT` commands from resting players were entirely ignored (`if (player?.resting && cmd.type !== CommandType.WAIT) return;`). This meant commands did not wake the player, violating the documented contract.

**Action:** Modified `resolveCommand` in `src/engine/systems/simulation/commands.ts`. If a resting player issues a non-`WAIT` command, we now call `stopPlayerResting` to wake them up. We then `return` to drop the command, so the player doesn't accidentally walk into danger on the exact frame they wake up.

**Prevention:** When implementing state-blocking flags like `resting` or `stunned`, verify the documented interruption contract. Do not assume all commands should be silently dropped; check if certain commands are meant to trigger state transitions instead.
