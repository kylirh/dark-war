# Daily curation log

Appended by `.claude/routines/daily.md`, newest last. Each entry covers one run:
what was merged, what was closed and why, what the review of `main` found, and
what a later run should check or stop re-reporting.

## 2026-09-01

**Merged:** nothing. Two runs today both found zero open pull requests — Jules
or otherwise — so Phase 1 had nothing to triage, de-duplicate, fix, or land.

**Closed:** nothing, for the same reason.

**Found in main:** reviewed all 21 commits in the 24-hour window. The
substantive source work (the `find` → `entityManager.getById` conversion in
#153/#160, the LAN-discovery and RetroModal XSS fixes in #157, the `escapeHtml`
consolidation, the webp asset migration in #154, and the `Application` →
`WebGLRenderer` switch in #155/#156) held up: the entity index is order
preserving and every `state.entities` reassignment funnels through
`replaceAll`/`new EntityManager`, the two loops that iterate the live item index
defer destruction rather than mutating mid-iteration, no reference to any of the
18 deleted PNGs survives, and `isSafeImageDataUrl` matches what
`toDataURL("image/png")` actually emits. No correctness defect met the oracle
bar, so the only change here is the documentation fix below.

Corrected `.claude/routines/daily.md`: it claimed the delete-path HTTP 403 came
from `git-receive-pack` and therefore "pushing commits may be blocked too". A
real push of a throwaway ref succeeds. Only ref _deletion_ is blocked.

**For next time:**

- **Pushing works. Stop testing it.** Creating and updating refs over plain git
  is fine; the Phase 2 pull request can go out normally. Do not burn a run on
  the `mcp__github__create_or_update_file` fallback unless a push actually 403s.
- **Branch deletion is blocked and will stay blocked** until someone widens the
  token. There is no MCP branch-deletion tool. One attempt per run is enough —
  do not retry per branch, and do not treat it as a reason to abort.
- `delete_branch_on_merge` was enabled partway through 2026-08-31, so branches
  merged before that (#152, #153, #158, #161, #162, #163) are still on origin
  and cannot be removed from here. Six of those plus `claude/push-probe-20260901`
  (a deliberate push-capability probe, points at main's tip, harmless) need a
  human with delete rights. Ten unmerged Jules branches from closed pull requests
  must be left alone.
- **Two things deliberately not fixed, twice now — do not re-report as new.**
  `capturePlayerSnapshotFromRenderer` in `src/client/systems/renderer.ts` passes
  a canvas-pixel `frame` to `extract.canvas({target: this.stage})` while
  `stage.scale` is the zoom factor, so the crop is plausibly wrong at zoom ≠ 1.
  It predates this window; #155 removed the readback fallback that used to sit in
  front of it, so it is now reached whenever the sprite-sheet path fails. It
  cannot be validated without launching Electron, which this environment cannot
  do — leave it for a human. Separately, `mpDiscoveredServers` and
  `mpStatusMessage` in `src/client/systems/game-menu.ts` are written and never
  read; confirmed dead at the base commit too, so they are pre-existing dead
  code and Janitor's job, not Phase 2 cleanup.
