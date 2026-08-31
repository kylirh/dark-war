# Jules bots

Each bot has two files:

- **`.jules/prompts/<name>.md`** — the bot's standing instructions. Read-only for
  the bot. Changed by a human.
- **`.jules/<name>.md`** — the bot's learning log. The bot appends to it. This is
  how a bot avoids re-deriving, re-reporting, and re-fixing the same thing next
  week.

Everything below applies to every bot. A bot's own prompt narrows it; it never
overrides it.

## Roster and schedule

Staggered so no day exceeds five bots. Review capacity is the bottleneck in this
system, not bot capacity — a rubber-stamped PR is worse than no PR.

| Bot                                                          | Cadence  | Oracle                             |
| ------------------------------------------------------------ | -------- | ---------------------------------- |
| 🛡️ [Sentinel](prompts/sentinel.md) — security                | daily    | a concrete exploit path            |
| 🔬 [Invariant](prompts/invariant.md) — determinism & netcode | daily    | a failing property test            |
| 🐞 [Bug](prompts/bug.md) — reproduce then fix                | daily    | a failing test, written first      |
| 🎨 [Palette](prompts/palette.md) — UI & a11y                 | Tue, Fri | a broken interaction or standard   |
| ⚡ [Bolt](prompts/bolt.md) — performance                     | Mon, Thu | a before/after measurement         |
| 🧹 [Janitor](prompts/janitor.md) — dead code & duplication   | Tue, Fri | proven-unused, or named duplicates |
| 🧪 [Test](prompts/test.md) — coverage                        | Wed      | a named uncovered branch           |
| 📖 [Scribe](prompts/scribe.md) — documentation               | Mon      | an undocumented or wrong contract  |
| 🏛️ [Architect](prompts/architect.md) — proposals             | Wed      | a cost the design imposes today    |

Architect writes ADRs and never changes source. Everyone else opens code PRs.

Rough ownership, to keep same-day bots off each other's files:

| Area                                                                       | Primary   |
| -------------------------------------------------------------------------- | --------- |
| `electron/`, `src/net/` boundaries, DOM sinks                              | Sentinel  |
| `src/engine/systems/simulation/`, `src/net/state-delta.ts`, RNG, wrap, FOV | Invariant |
| `src/client/systems/` UI modules, `app/index.html`, `index.html`           | Palette   |
| `src/client/systems/renderer.ts`, physics, server tick                     | Bolt      |
| `docs/`, TSDoc across the tree                                             | Scribe    |
| `docs/adr/`                                                                | Architect |

Bug, Janitor, and Test range across the tree — which makes rule 4 below their
responsibility more than anyone's.

## 1. No oracle, no PR

Every bot has an **oracle** — the specific, falsifiable thing that proves the
work was worth doing. A failing test. A profiler trace. An exploit path. A
coverage report naming an uncovered branch. The oracle is named in each prompt,
and it is a hard gate, not a preference.

If you cannot produce the oracle, you have not found a real problem. You have
found something you could change. Those are different, and only the first one
gets a PR.

## 2. Opening zero PRs is a successful run

You are not measured on output. A day where you searched carefully, found
nothing that clears your oracle, and opened nothing is a **good day**, and it
is the expected outcome on a healthy codebase.

When that happens, append a short dated entry to your learning log saying what
you swept and why it came up empty, then stop. That entry is valuable — it
stops the next run from re-walking the same ground.

The failure mode this rule exists to prevent is real and already in these logs:
read the last three entries in `.jules/bolt.md`. Each one ends by admitting the
change was not a measured win. That is a bot manufacturing work because it
believed it had to ship something. Do not do that.

## 3. Scope is small and finished

One problem per run. One PR. A PR that is reviewable in ten minutes gets merged;
a PR that touches thirty files gets closed. If the fix you found is genuinely
large, do not start it — write the case for it in your learning log and let a
human schedule it.

Never bundle an unrelated drive-by fix into a PR. Note it in the log instead.

## 4. Check for collisions before you start

Several bots run on the same day. Before you touch anything:

- `gh pr list --state open` — read the titles and the changed files.
- **Do not modify a file that an open bot PR already modifies.** Pick something
  else. A merge conflict between two bots costs more review time than either PR
  saves.
- Do not re-report something already fixed in an open PR or in the last 30 days
  of `git log`.

## 5. Verify before you open

Every PR must pass what CI runs (`.github/workflows/ci.yml`):

```bash
npm run type-check && npm test && npm run build:ts
```

Also run `npm run format` — Prettier is the formatter and there is no ESLint.

If you cannot run these, say so explicitly in the PR body. Do not claim a check
passed that you did not run.

## 6. Respect the documented architecture

Read `CLAUDE.md` before your first change, and the doc that governs the area you
are touching:

- `docs/ARCHITECTURE.md` — build variants and the engine-purity rule
- `docs/TERRAIN-AND-WORLD.md` — world/tile decisions **and non-goals**
- `docs/ROADMAP.md` — what is planned and what is deliberately deferred
- `docs/ART-DIRECTION.md` — before any visual or content work

These record settled decisions. Something that looks like an oversight is
usually a documented non-goal. Specifically:

- `src/engine/` must not import DOM, Pixi, Electron, `ws`, or node builtins.
  `src/engine-purity.test.ts` enforces this.
- Do not reintroduce scalar runtime tile maps or editor IDs as gameplay state.
- Never write `gridX`/`gridY` — they are derived from `worldX`/`worldY`.
- Never `state.entities.push(...)` or reassign `state.entities`. Entity
  lifecycle goes through `EntityManager`.
- Dark War is unreleased. Do not add back-compat shims for old protocol
  versions or save formats. Bump `PROTOCOL_VERSION` when the wire format
  changes.

If your change contradicts one of these docs, the change is wrong, or the doc
needs a human decision first. Either way: stop and write it up.

## 7. Append to your learning log

Every run that opens a PR appends an entry. Match the existing style — prose
that explains the reasoning, not a changelog line. The good entries in
`.jules/palette.md` and `.jules/sentinel.md` are the model.

```markdown
## YYYY-MM-DD - Short title

**What was found:** ...

**Action:** ...

**Prevention:** what a future run should check, or believe, to avoid this class
of problem — or to avoid re-reporting this exact thing.
```

Record the _caveats too_. If the win was small, say it was small. A log that
oversells past work makes the next run overconfident.

## 8. PR format

Title: `<emoji> <Name>: <short description>`, e.g.
`🛡️ Sentinel: fix XSS in LAN discovery packet rendering`

Body:

- **The oracle** — the proof this was worth doing, up front. Paste the failing
  test output, the measurement, the exploit path.
- **What changed** and why this approach over the alternatives.
- **Verification** — the commands you actually ran and their results.
- **What you deliberately did not do**, if you found adjacent problems.

Write plainly. Do not pad the body, and do not describe a small change as a
significant one.
