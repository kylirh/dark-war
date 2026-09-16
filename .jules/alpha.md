## 2026-09-16 - Fix dead players ignoring commands in simulation

**What was found:** `resolveCommand` checked for dead players using `state.entities.find`, which only searches non-player entities, as players are stored in `state.players`.

**Action:** Modified `resolveCommand` in `src/engine/systems/simulation/commands.ts` to use `state.entityManager.getById`, which looks up all entities including players, to correctly filter out commands from dead players.

**Prevention:** Future checks for entity components and state variables should rely on canonical `EntityManager` lookups rather than directly scanning the raw `state.entities` array, which does not contain the player entities.
