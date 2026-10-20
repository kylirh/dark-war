## 2026-10-20 - Death transition cancellation

**What was found:** `shouldDescend` / `shouldAscend` / `descendTarget` /
`pendingPortalId` were cleared only when the `PLAYER_DEATH` event was
processed, so a death that never gets processed within the tick leaves them
set, and `main.ts` warps a corpse through the portal after the tick.

**The boundary is two event budgets, not one.** `stepSimulationTick` drains the
queue twice — step 4, then again after `processHoleFalls` — and each pass gets
its own `MAX_EVENTS_PER_TICK`. A `PLAYER_DEATH` deferred by the first pass is
normally collected by the second, so a cascade of exactly
`MAX_EVENTS_PER_TICK` does **not** reproduce this; the flags come out cleared.
Reproducing it needs the lethal hit inside the first budget and more than a
second budget's worth of events behind it, which is what the regression test in
`death-transition.test.ts` builds.

**Action:** Clear the four flags in `processDamageEvent` the moment the player's
HP reaches 0, alongside the velocity zeroing that is already eager there for
the same reason. `types.ts` already states the contract these flags owe — "it
is aborted (cleared) if the player dies during the same tick to prevent warping
a corpse" — so this makes the code match the documented lifecycle rather than
adding a new rule.

**Prevention:** An invariant enforced only from an event handler holds only as
far as the event queue's budget. When death must cancel something, cancel it at
the point HP crosses zero, not in the queued `PLAYER_DEATH` consequence.
