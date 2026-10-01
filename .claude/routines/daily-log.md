# Daily Curation Log

Appended by the daily routine (`.claude/routines/daily.md`). Newest last.

## 2026-09-19

**Merged:** #283 `test(simulation): cover monster self-healing interval and hp cap` —
`selfHeals` had no coverage; mutation-checked (interval and hpMax cap each fail
the test when broken). #282 `refactor(simulation): consolidate deterministic
command sorting` — the two comparators were byte-identical, so the extraction is
behavior-preserving. #281 `docs(adr): propose data-driven content registries`,
after rewriting two of its three claimed costs. #280 `fix(a11y): restore focus to
the opening control when dialogs close`, after supplying the oracle it lacked and
fixing a hole.

**Closed:** #284 `fix(world): enforce strict orthogonal traversals`. The oracle
does not hold. `canTraverse` is documented as "can cross directly between
neighboring cells", and both `pathfinding.ts:97` and `ai.ts:135` expand an
**8-connected** neighborhood and gate each step on it. Manhattan makes every
diagonal return `false`, silently turning click-to-move and monster pathing
4-directional: measured on an open plane, `(0,0)->(5,5)` goes from 6 steps to an
11-step staircase. `Physics.ensureTerrainBoundary` only ever passes east/south,
so nothing actually wants diagonals rejected.

**Found in main:** two things, both in what landed today, both in the Phase 2
pull request.

1. `restoreFocus` guarded with `document.body.contains(opener)`, which answers
   "is it in the document", not "can it take focus". A control inside a dialog
   hidden while another was open is still contained, but `display: none` and
   `disabled` both make `focus()` a silent no-op that leaves focus on `<body>` —
   the exact stranding the module exists to prevent. Now attempts the focus and
   verifies it landed.
2. `sortCommandsDeterministically` had no test. Its `actorId`/`id` tie-breaks are
   load-bearing for netcode and RNG determinism, and dropping either broke no
   test. Now covered, mutation-checked against all three levels.

Also added the exhaustiveness trade-off missing from ADR 0005: `Record<ItemType,
ItemDef>` gives compiler-enforced registry completeness today (verified: a new
enum member with no entry yields `TS2741`), and Option 2 would remove it.

**For next time:**

- **The diagonal-traversal change keeps coming back.** #284 today, and #275,
  #270, #268 before it were all closed unmerged. That is four rejections of the
  same edit. It is a movement **design** question, not a bug; do not re-review it
  from scratch. Related unmerged branches still on origin: `fix-cantraverse-wrapping-*`,
  `fix/world-wrap-traverse-*`, `fix/world-plane-wrap-*`.
- **Re-check the diff immediately before merging a Jules pull request you have
  commented on.** On #280 the integration answered my review by pushing a commit
  that reverted it _and_ deleted #283's already-merged test, because the branch
  had dropped its merge of `main`. Merging would have silently reverted landed
  work, and **CI was green on it** — the suite cannot notice its own tests going
  missing. It was a normal commit, not a force-push, so it was correctable
  forward.
- **Jules log entries keep carrying wrong dates:** #284 wrote `2025-02-15`, #282
  `2024-05-18`, #280 `2026-10-24` (in the future). Corrected on the merged ones.
  Worth fixing in the prompts.
- #281 is not a re-run of #278, which a previous run closed. #278 rested on a
  `types.ts` merge-conflict claim the history contradicted; #281 rests on the
  dialogue relational-integrity gap documented verbatim in
  `dialogue-defs.test.ts`. I removed the merge-conflict claim before merging.
- `npm ci` before trusting `type-check` here: the sandbox had TypeScript 6.0.2
  installed against a lockfile pinning 5.9.3, which fails `main` with a bogus
  `TS5107`. That is the environment, not a red `main`.
- Remote branch deletion is unavailable to this routine (blocked before reaching
  GitHub). Ten merged branches are listed in the run summary for a human.

## 2026-09-21

**Merged:** #292 `perf(net): replace json stringify with structural equality in
state deltas`, after reproducing the measurement and adding the coverage it
lacked. #293 `fix(a11y): add aria-pressed state to character modal toggles`,
as-is. #295 `docs(adr): propose runtime validation for untrusted inputs`, after
correcting a false citation and adding a third option.

**Closed:** #294 `fix(world): reject diagonal traversals in world plane`. Fifth
proposal of the same one-line Manhattan edit after #268, #270, #275, #284. Its
oracle was circular — the "failing test" was one the pull request itself added
asserting the new behaviour.

**Found in main:** nothing defective in the newly merged code. The Phase 2 pull
request closes the coverage gap that reviewing #294 exposed.

**For next time:**

- **The diagonal-traversal edit is now pinned, so it should stop coming back.**
  The reason it kept looking plausible is that nothing covered the contract:
  the whole 834-test suite passed with `canTraverse` switched to Manhattan, so
  every one of the five pull requests could truthfully say "npm test passed."
  `world-plane.test.ts` and `pathfinding.test.ts` now fail under that mutation
  (verified). A sixth proposal should now fail CI rather than need review. Note
  `FlatTileSource.canTraverse` ignores direction entirely, so the pathfinding
  test had to use a `WorldPlane` — a `FlatTileSource` test cannot catch this.

- **An integration push reverted review corrections again — second time.** On
  #292, `e28b98e6` deleted all eleven tests added during review and restored the
  log entry's unscoped claims, leaving the perf change itself untouched. **CI was
  green on it**, because a suite cannot notice its own tests going missing. #280
  did the same on 2026-09-19 and additionally deleted an already-merged test.
  Both were normal commits and correctable forward. Keep re-checking the head
  immediately before merging; a green check on a Jules branch you have
  commented on is not evidence the corrections survived.

- **Second ADR in a row with a citation defect.** #295's 2026-08-30 bullet said
  a numeric `name` field bypassed escaping and crashed the server list.
  `.jules/sentinel.md` says `name` and `host` _were_ escaped and the hole was in
  `phase`/`players`/`maxPlayers`; the 2026-09-02 entry records that exact
  numeric-`name` case as already hardened, asserted by
  `discovery-packet.test.ts:92`. #286 misattributed `invariant.md` entries to
  `bolt.md`. Verify ADR citations against the logs rather than reading them.

- **Bolt's measurement held this time,** which is worth recording after two
  entries whose headline multipliers did not. ~2x reproduced independently
  (637ms to 303-368ms). The framing did not hold: "server tick delays" and
  "massive GC churn" were never demonstrated, and at a realistic ~150 entities
  the saving is ~120us against a 50ms tick. Scoped in `.jules/bolt.md`. When
  reviewing a Bolt entry, check whether the benchmark shares object references
  between baseline and next — the identity short-circuit makes a fake 16x.

- **`.claude/routines/daily-log.md` is also created by #285**, the unmerged
  Phase 2 pull request from 2026-09-19, which carries that run's entry. Whichever
  lands second needs a trivial merge of the two entries. #285 is still open and
  is not a Jules pull request, so this routine left it alone.

- **Branch deletion is still unavailable.** Thirteen merged branches remain on
  origin; `git push origin --delete` answers "Everything up-to-date" and deletes
  nothing. Listed in the run summary for a human.

- **Pre-existing, deliberately not fixed:** `game-menu.ts:469` and `:1231` query
  `document.querySelectorAll("[data-zoom-value]")` document-wide, while
  `CharacterModal` builds its own buttons with that attribute. With both in the
  DOM, GameMenu's sync reaches into the character modal's zoom buttons. Not
  touched by any pull request in this window.

## 2026-09-23

**Merged:**

- **#303** `refactor(simulation): consolidate portal transition checks in commands` —
  Janitor. Real duplication: `resolveDescendCommand` and `resolveAscendCommand`
  had identical portal-lookup bodies. Fixed on the branch before merging: the
  extracted helper returned `string | undefined` while being named for a portal,
  and both call sites used a falsy check on it; it now returns
  `WorldPortal | null`. Also replaced `any` parameters on the new
  `fireReloadCommand` test helper with real types.
- **#301** `docs(client): document retromodal focus management contract` —
  Scribe. The constructor comment at `retro-modal.ts:45-53` explained what the
  component deliberately does not do, but never the caller's obligation, and as
  an inline comment it never reached IntelliSense. Fixed on the branch: the
  contract as written said to capture the opener before _every_ `show()`, which
  is the trap. Callers must skip the capture when the dialog is already open
  (`game-menu.ts:1462-1464`).

**Closed:**

- **#300** `fix(engine): prevent invalid diagonal cell traversals` — the **eighth**
  proposal of the identical `Math.max` -> Manhattan edit in
  `WorldPlane.canTraverse`, after #268, #270, #275, #284, #288, #294, #298.
  The 8-connected neighbourhood is deliberate: `pathfinding.ts:80-108` and
  `ai.ts:133-148` both expand all eight neighbours and gate each step on
  `canTraverse`. Measured directly rather than argued — on an open 8x8 plane,
  `findPath (1,1)->(5,5)` goes from 5 diagonal steps to a 9-step L-shaped
  detour. The body's claim that AI pathfinding was "audited and determined safe"
  is false.
- **#302** `docs(adr): propose extracting simulation pipeline limits` — Architect.
  Oracle fails. The Context claimed there is "no uniform mechanism for ...
  logging"; both sites already `console.error` (`events.ts:70-72`,
  `tick.ts:90-94`). Its headline benefit — per-build-variant tuning of
  `MAX_EVENTS_PER_TICK` / `MAX_COMMANDS_PER_TICK` — contradicts
  `ARCHITECTURE.md:25-26` ("The same engine runs offline, in the Electron
  client, and on the authoritative server") and would break determinism, since
  `tick.ts:89-94` truncates before sorting so which commands survive changes the
  resulting state.

**Found in main:** the descend/ascend command path had **no test coverage at
all**. Making `getTransitionPortal` return `null` unconditionally — which
disables every stairway in the game — left all 845 tests passing. So did
dropping the `"No stairs here."` alert, the player-kind guard, and the
`descendTarget = undefined` reset. #303 made this sharper by routing both
commands through one helper. Covered by `level-transitions.test.ts` in this
pull request.

**For next time:**

- **Stop re-reviewing the diagonal-traversal edit.** Eight closes. It is a
  product decision about how the game moves, not a defect. #296 (open) pins the
  contract; landing it would end the cycle at the source. Until then, close on
  sight and cite this entry.
- **`npm test` passing proves little about `canTraverse` and proved nothing
  about descend/ascend.** Both were entirely uncovered. Treat a bot's "tests
  pass, no regressions" as unverified for these paths.
- **Believe:** branch deletion is blocked in this environment. `git push origin
--delete` fails identically on every branch (remote hangs up). Attempt once,
  list the rest, move on. `delete_branch_on_merge` does work for most merges,
  but `refactor-simulation-commands-6932021227322539262` survived its own merge
  this run — a human can remove it.
- **Check:** the repo's commit-msg hook (`scripts/validate-commit-message.mjs`)
  rejects _any_ uppercase in the whole message, including inside identifiers and
  URLs. A `Claude-Session:` trailer cannot be committed here. Write commit
  bodies fully lowercase.
- **Not acted on, no oracle:** `tick.ts:89-94` truncates `aiCommands` _before_
  `sortCommandsDeterministically`, so overflow drops commands in generation
  order rather than lowest-priority-first. Arguably the wrong order, but nothing
  shows the 1000 limit is ever reached.

## 2026-09-25

**Merged:** #309 `fix(net): round-trip levels through state delta compression`
and #310 `docs(adr): propose deterministic simulation budgets`. Both needed
corrective commits first.

#309's oracle holds — reverting only `src/net/state-delta.ts` and keeping the
new test reproduces the failure. Two things are worth believing about it rather
than re-deriving:

- Its body frames this as a live multiplayer bug. It is not. The server migrates
  players between separate `LevelWorld` games via `detachPlayer` /
  `attachExistingPlayer` and never calls `Game.descend()` / `ascend()`, which are
  the only callers of the private `saveCurrentLevelSnapshot()`. A server-side
  `Game` therefore keeps `levels` empty and serializes `[]`. It was merged as a
  contract fix — `state-delta.ts:16` already named `levels` as a delta-carried
  field — not as a bug fix. The added comparison is free in the hot path for the
  same reason (`shallowJsonEqual([], [])` exits on the length check).
- Its claim that no other `SerializedState` field is omitted checks out. `sim`,
  `effects`, `sounds`, `alerts` and `callouts` are absent from the optional-field
  handling because they are _required_ on `StateDelta` and sent every delta, per
  the comment at `state-delta.ts:72`. Do not "fix" those.

Corrections pushed: the learning-log heading was a literal `$(date +%Y-%m-%d)`,
and the round-trip test was equally satisfied by assigning `delta.levels`
unconditionally, which would have put every visited level on the wire each tick.

#310 asserted that both safety limits "stop and defer the rest to the next
tick". True for events, false for commands — `tick.ts:89-95` truncates
`aiCommands` outright and `generateAICommands` rebuilds the list next tick, so
the excess is dropped, not queued. The Consequences section had inherited the
error. Corrected, and recorded the cost it had missed: truncation runs _before_
`sortCommandsDeterministically`, so the surviving 1000 are the earliest
generated, not the highest priority.

**Closed:** nothing. Only two Jules pull requests were open and both were
salvageable. No duplicate groups this run.

**Found in main:** one real defect, in the Phase 2 pull request. Pressing
ascend while standing on a _downward_ staircase moved the player deeper.
`getTransitionPortal` accepted any portal of kind stairs/ladder/cave-mouth/door
for both commands, so `resolveAscendCommand` happily took the down-stairs'
portal and `Game.ascend()` followed its destination. Reproduced at depth 1 after
a round trip to depth 2 (the destination snapshot must be resident, or
`Game.ascend()` bails on the missing snapshot and masks it). Fixed by rejecting
a portal whose depth change opposes the command.

**For next time:**

- The direction guard deliberately exempts portals whose destination has no
  depth (`depthForWorldAddress` returns `null` for `caves` / `settlement`) and
  portals on the current depth. The outside cave mouth and workshop door are
  both depth 0 and are entered through these same two commands, so a strict
  `>` / `<` check without those exemptions breaks them. There is a regression
  test for exactly that; do not "simplify" it away.
- The wrong-direction case reuses the existing `"No stairs here."` alert, which
  reads oddly while standing on stairs. New player-facing copy is a product
  decision and was left alone — same conclusion #304 reached about the ascend
  wording. Stop re-reporting it as a defect.
- `.claude/routines/daily-log.md` is created by four open pull requests now
  (#285, #296, #304, and this run's). Whichever lands second onwards needs a
  trivial merge of entries. Earlier entries were not copied in, since that
  content belongs to pull requests still awaiting review.
- Branch deletion is still 403 from this environment, and so is
  `git push origin --delete`. Pushing commits works. One throwaway ref,
  `claude/push-capability-test-20260925`, was created by the routine's mandated
  push test and could not be deleted; a human may remove it.

## 2026-09-30

**Merged:** #326 `refactor(engine): consolidate duplicate game state init logic`
— extracts the ~25 lines of `GameState` boilerplate shared by
`createInitialState`, `reset`, and `deserialize` into `createBaseState`.
Corrected on the branch before merging (see below).

**Closed:**

- **#324** (diagonal traversal) — the **twelfth** proposal of the same one-line
  narrowing of `WorldPlane.canTraverse` from Chebyshev to Manhattan. Previously
  #263, #268, #270, #275, #284, #288, #294, #298, #300, #315, #320.
- **#325** (wake resting player) — a re-proposal of #321, closed the day before
  with the same stated root cause. Also shipped a 1918-line
  `commands.ts.orig` merge artifact and changed no test.

**Found in main:** nothing defective. The 24-hour window was exactly #326.

**For next time — things a later run should believe without re-deriving:**

1. **`WorldPlane.canTraverse` is deliberately 8-connected.** Both pathfinders
   (`utils/pathfinding.ts`, `systems/simulation/ai.ts`) expand all eight
   neighbours and gate each step on it. Narrowing it to Manhattan silently
   makes click-to-move and monster pathing four-directional. Verified again on
   2026-09-30: with the Manhattan change applied to `main`, **all 97 files /
   852 tests still pass**. "npm test passed" is therefore worth nothing on this
   predicate, which is exactly why the bots keep proposing it. #296 pins the
   contract and would end the cycle; it is still open.

2. **The `REST_TIME_SCALE` leak does not exist.** All three assignments are
   gated on `player.resting`, and `stopPlayerResting` resets both `timeScale`
   and `targetTimeScale` synchronously. Whether an action _should_ interrupt
   rest is a product decision, not a defect. Re-checked on 2026-09-30; the code
   is unchanged since #321 was closed.

3. **There is no `.jules/world.md` or `.jules/alpha.md` learning log.** That is
   the direct cause of 1 and 2 recurring: those bots have nowhere to read their
   own rejections from. #323 adds `world.md` and is still open. Until one lands,
   expect both to be proposed again.

4. **Pin `expectedHeadSha` on every merge.** The 2026-09-25 run lost #309 to a
   stale squash that merged an out-of-date view of #310's branch. #326 was
   merged with the SHA pinned and verified afterwards
   (`git diff origin/main <branch-tip>` empty).

5. **The commit-msg hook rejects any uppercase character anywhere in the
   message**, trailers included (`scripts/validate-commit-message.mjs`). A
   `Claude-Session:` trailer cannot be added locally without failing it, since
   lowercasing the URL breaks the link. Squash-merge titles set through the API
   bypass the hook, which is why `main`'s history contains mixed-case bodies.

6. **Branch deletion still 403s.** `git push origin --delete` fails with HTTP
   403 and the `mcp__github__*` toolset has no branch-deletion tool. 39 merged
   branches are deletable and could not be removed; 56 unmerged leftovers from
   closed pull requests must be left for a human either way. One attempt is
   enough to confirm — do not retry.

## 2026-10-01

**Merged:** #330 `perf(net): replace object.keys traversal in state delta equality`
and #329 `refactor(test): consolidate duplicate monster pickup and vending setup`.
Both were corrected on their branches first.

**Closed:** #328 (interrupt rest on non-WAIT command) — the **third** proposal of
this change after #321 and #325, and the premise is false, not merely
re-litigated. `REST_TIME_SCALE` is assigned in exactly one place, on the branch
that sets `player.resting = true`, and every wake path runs `stopPlayerResting`,
which resets both `timeScale` and `targetTimeScale` synchronously. It cannot leak
into movement either: `src/client/main.ts:1072` (`predictLocalPlayer`) and
`src/client/main.ts:1809` (`handleUpdateVelocity`) both zero velocity while
resting, so no frame applies an 8x scale to a non-zero velocity. Its oracle was
circular, and the same diff rewrote `commands.test.ts`'s
`ignores non-WAIT commands when resting` into its own negation — the clearest
evidence the behaviour is deliberate. Whether an action should cancel rest is a
product decision.

**Found in main:** no correctness defect. The whole 24-hour window — #326's
`createBaseState` extraction, `004a188`'s compact entity ordering, `d26f8f3`'s
world-map and settings fixes, and both of today's merges — checks out. The Phase 2
pull request is coverage only.

**For next time — things to believe without re-deriving:**

1. **`diffById`'s order check is correct; do not "simplify" it.** It verifies
   `next == survivors(in base order) ++ new(in next order)`, which is exactly
   what `applyById` reconstructs when `order` is omitted — surviving keys keep
   their Map position and new ids append in `upserted` order, which is `next`
   order. The shared `naturalOrderIndex` across the two loops is load-bearing,
   and the `&&` short-circuit in the second loop is what keeps the index
   advancing only for new entities. Seven `it.each` cases cover it.

2. **`nearestDisplayedTile` returns integers despite the fractional
   `windowCenter`.** For odd `windowSpan` the centre is `x.5`, but the expression
   reduces to `tile - mapSpan * floor(v / mapSpan)`, so the halves cancel exactly.
   Do not "fix" it with a `Math.round`.

3. **`#pause-dialog [data-zoom-value]` is deliberately scoped.** `CharacterModal`
   builds its own zoom buttons with the same `data-zoom-value` attribute and
   attaches its own click handler (`character-modal.ts:434`), scoping its sync to
   `this.window`. The unscoped `document.querySelectorAll` that `d26f8f3` replaced
   made `GameMenu` attach a second handler to the modal's buttons. Widening it
   back re-introduces double handling.

4. **`for...in` beat `Object.keys` in `shallowJsonEqual` (-38% to -42%), but that
   is not a general rule** and the result does not transfer. More importantly,
   **cross-process A/B benchmarking is worthless on this hardware** — single-run
   `computeStateDelta` medians swing about ±30%, and a naive branch-vs-branch
   comparison of #330 came out backwards. Put both variants in one process with
   interleaved rounds.

5. **A merge of `main` into a bot branch needs a hand-written commit message.**
   `scripts/validate-commit-message.mjs` rejects git's default
   `Merge remote-tracking branch ...` subject, so `git merge origin/main` fails
   at the hook and leaves the merge staged but uncommitted. The same hook rejects
   any uppercase character, so a `Claude-Session:` trailer still cannot be added
   locally without breaking the URL.

6. **Branch deletion still 403s, and Jules pushes to branches after they
   close.** One deletion was attempted this run, with a lease, and failed the
   same way as every previous run: `git push origin --delete` returns HTTP 403.
   Pushing commits works fine; it is deletion specifically. One attempt is
   enough — do not retry.

   More useful than the 403: **both bot branches moved after their pull request
   closed.** `janitor/test-setup-consolidation-...` was merged at 07:21:14 and
   Jules pushed `f665559` onto it at 07:22:17, which is simply the branch's
   pre-review state — it would restore the mid-file `Player` import, drop the
   delegation to `interact`, and drop the return types.
   `fix-resting-interruption-15824223162374495795` (#328, closed unmerged) got
   `4f317a9 Revert changes as PR was closed`. Both branches therefore carry
   commits not in `main` and are **not** deletable under the routine's own
   fully-merged rule, 403 or no 403. This is the 2026-09-19 hazard again — a bot
   answering review by pushing over it — and the reason to re-check the diff
   immediately before merging and to pin the head sha at merge time.

7. **`deserialize`'s field order is load-bearing and was almost untested.** It
   spreads `createBaseState()` and then overrides the five fields a save carries.
   Moving that spread below the overrides leaves all 890 tests green while
   `story`, `effects`, `godMode` and `multiplayer.mode` silently revert to a fresh
   level's defaults on every load. `sim` was already pinned by `33d61b5`; the
   Phase 2 pull request pins the first three. `multiplayer.mode` is still
   uncovered on purpose — see below.

**Needs a human:** `deserialize` takes `multiplayer.mode` from the save
(`data.multiplayer.mode`), not from the `Game` it is loading into, so an offline
save loaded into an online `Game` leaves `state.multiplayer.mode === "offline"`
while `this.multiplayerMode` is `"online"`. That is pre-existing and untouched by
this window. It is the one remaining field exposed to the spread-ordering hazard,
and it was left uncovered deliberately: a test pinning it would cement a
semantic that may well be wrong.
