## 2026-10-05 - Engine-to-Host Transition Signals

**What was found:** The `GameState` object contains ephemeral flags (`shouldDescend`, `shouldAscend`, etc.) used exclusively to signal level transitions to the offline host. This design led to a bug (documented in `.jules/bug.md`) where the host acted on these flags even if the player died later in the same tick. It forces the engine to manually cancel these flags on death and pollutes the simulation state with host-specific routing logic.

**Action:** Proposed ADR 0011 recommending the removal of these transition flags from `GameState` in favor of returning transient `HostIntent` signals from the simulation loop.

**Prevention:** When an offline-only routing or presentation signal is needed, return it out-of-band (e.g., as a return value from the tick function) rather than storing it on the canonical `GameState`. Persistent state should not be used as a messaging queue for the host environment.

**Corrected during review:** the ADR as first written claimed that removing the
flags would stop them "polluting the serialized state". None of the four is in
`SerializedState`, so there is no save- or wire-format gain; the cost is
in-memory only. It also missed that `shouldDescend` has an _intra-tick_ reader
(`tick.ts:462`, the `processHoleFalls` guard), which an end-of-tick intent
cannot serve, so the recommended option keeps an internal marker rather than
removing the flag. And the offline host consumes the flags at two sites in
`main.ts`, not one. Verify which fields are serialized and count every reader
before claiming a field is purely host-bound.

## 2026-10-15 - Proposed ADR for Eight-Directional Movement

**What was found:** The Chebyshev distance check (`Math.max`) in `WorldPlane.canTraverse` enables 8-way diagonal movement but looks like an off-by-one bug to developers, leading to repeated pull requests attempting to narrow it to a 4-way Manhattan check. Thirteen have been closed unmerged: #263, #268, #270, #275, #284, #288, #294, #298, #300, #315, #317, #320, #324. This caused recurring code review churn.

**Action:** Wrote Proposed ADR 0012 formalizing the architectural decision to maintain 8-directional (Chebyshev) movement rather than changing the game design to 4-directional movement just to make the code look less confusing.

**Prevention:** When an intended design decision causes repeated confusion or PR churn because it resembles a bug, document the explicit choice in an ADR. Never change core gameplay mechanics (like movement systems) merely to satisfy a perceived code aesthetic.

**Corrected during review:** the first draft cited `.jules/world.md`'s count of
eleven and asserted the contract is untested. Both were stale. #317 is missing
from that list and #324 landed the day after the entry was written, so the real
count is thirteen; and `world-plane.test.ts` plus two `pathfinding.test.ts`
cases now fail under the Manhattan edit, verified by mutating
`world-plane.ts:183` and running the full suite (3 failed / 906 passed).
A log's own count is a snapshot, not a current fact — re-derive it from the
pull request list before citing it, and mutate the predicate before claiming
nothing covers it.

## 2026-11-01 - Prioritize AI Command Overflow

**What was found:** `stepSimulationTick` truncates the AI command array to `MAX_COMMANDS_PER_TICK` before running `sortCommandsDeterministically`. As documented in `.jules/test.md` (2026-10-22) and left as an open question in ADR 0009, this means overflow drops the latest-generated commands rather than the lowest-priority ones, making AI behavior under load arbitrary rather than prioritized.

**Action:** Wrote Proposed ADR 0013 recommending that AI commands be truncated
after sorting, so the simulation load-sheds the lowest-priority commands first.
The ADR recommends; the choice is still ADR 0009's open question and belongs to
a human.

**Prevention:** When implementing safety limits like max-operations-per-tick,
ensure the limits are applied _after_ sorting if the elements have explicit
priority. Also size the win before writing it up: `generateAICommands` emits
only two priority values, and `priority: 1` is used solely for ranged fire, so
reordering the truncation preserves shots over movement and nothing finer. Do
not describe it as rescuing "critical actions like attacking or healing" —
melee attack is `priority: 0` and no healing command exists.

## 2026-11-09 - Synchronous death state invalidation

**What was found:** The `.jules/bug.md` log records a recurring bug class where entities with `0` HP continue to move or execute level transitions because the `DEATH` and `PLAYER_DEATH` events can be deferred to the next tick by the `MAX_EVENTS_PER_TICK` limit. This forces all sources of lethal damage to synchronously call `haltDyingPlayer` or zero velocities by convention, a rule that was repeatedly forgotten (e.g., the black pill bug on 2026-11-05).

**Action:** Wrote Proposed ADR 0014 recommending the removal of death events from the deferrable event queue in favor of a synchronous `processDeaths(state)` phase at the end of the simulation tick.

**Prevention:** When a deferred event system creates temporal gaps that allow invalid state to be acted upon, do not patch it by forcing callers to duplicate state invalidation synchronously. Move the invalidation into a structural phase that guarantees correctness.
