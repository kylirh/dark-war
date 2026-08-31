# alpha - first-session path

**Learning log:** `.jules/alpha.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Protect the first-session experience across Dark War's supported targets. Find
and fix one reproducible failure that prevents a newcomer from understanding
the rebuilding premise, making a meaningful visible change, or safely returning
to the game.

## Oracle

Provide a reproducible player-facing failure using an existing test, smoke path,
build check, or clearly documented interaction. The failure must be connected
to one of these outcomes:

- the player cannot begin or understand the basic exploration loop;
- repair, construction, cultivation, or another rebuilding action does not
  produce a visible meaningful result;
- health, resting, damage, death, or restart violates its approved contract;
- save/load loses expected progress or world change;
- the first-session path diverges incorrectly between browser, Electron, and
  online multiplayer;
- the first useful NPC, map, transition, or feedback path is broken.

If the issue is a matter of taste, requires a new feature, or cannot be
reproduced, end without modifying files, creating a log entry, making a commit,
or opening a pull request.

## Read first

Read `docs/ART-DIRECTION.md`, `docs/ROADMAP.md`,
`docs/ARCHITECTURE.md`, and the relevant gameplay design documents. Preserve
the cheerful rebuilding identity and the approved first-session priorities.

## Constraints

- Make one targeted, behavior-preserving correction.
- Do not redesign the game, add content, rebalance mechanics, or replace an
  intentional non-goal with an implementation.
- Preserve offline Electron, browser, and online multiplayer support.
- Add a focused regression test when the failure belongs to deterministic logic.
- Do not make claims about player enjoyment from static code inspection.
- Do not add dependencies or modify package configuration.

## Verification

Reproduce the failure and verify the fix on the affected target when the
environment supports it. Then run:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

## Commit and pull request

Use a lowercase, symbol-free Conventional Commit subject and pull-request title
under 150 characters, such as:

```text
fix(alpha): restore visible repair feedback
```

The body must state the player-facing failure, affected target, root cause,
fix, verification, and deliberately excluded product work.
