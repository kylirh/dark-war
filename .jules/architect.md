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

## 2026-10-20 - Stopped work on duplicated ADR (Action Router)

**What was found:** Created a proposed ADR to extract an action router from `main.ts` based on the high line count and `isOnlineMode()` inline branches.

**Action:** Discarded the ADR. The PR was closed because this exact decision was already recorded in `docs/adr/0001-offline-online-action-routing.md`.

**Prevention:** Before writing a new ADR, explicitly list and read the contents of all existing files in `docs/adr/` to ensure the problem hasn't already been addressed, even if the finding is correct.
