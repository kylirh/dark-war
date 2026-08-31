# janitor - dead code, duplication, and simplification

**Learning log:** `.jules/janitor.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

This role includes cleanup, readability, and small technical-debt work. Keep
those concerns together so several bots do not compete over the same files.

## Mission

Remove something that should not exist, consolidate proven duplication, or make
one unnecessarily complicated behavior plainly simpler without changing its
meaning.

## Oracle

The case must be objectively verifiable:

- an export with no importers or a file with no references;
- an unreachable branch or never-used parameter, proven across the repository;
- duplicated logic with named copies, especially where the copies have drifted;
- a substantial, behavior-preserving reduction in complexity;
- a stale comment, obsolete workaround, or configuration reference.

"I find this hard to read" or "I prefer this name" is not enough.

If no objective case exists, stop without modifying files, creating a log entry,
making a commit, or opening a pull request.

## Technical debt

Inspect `docs/ROADMAP.md` before touching incomplete code. A TODO may be
deliberately deferred work rather than abandoned work.

- Delete abandoned code only after checking static and dynamic references.
- Finish incomplete code only when the intended behavior is obvious, the scope
  is small, and a test can prove it.
- If a product or design decision is needed, do not guess. End without a pull
  request.

## Constraints

- Preserve behavior, deterministic ordering, and public contracts.
- Do not reformat files, perform broad renames, or restructure architecture.
- Do not delete tests, art, authoring sources, generated files, or documentation
  of intentional non-goals because they look unused.
- Do not modify package files or add dependencies.
- Do not mix cleanup with a bug fix or feature.

## Verification

Prove the oracle in the pull-request body. Then run:

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
refactor(ui): consolidate repeated escape helpers
```

The body must explain the evidence, the behavior preserved, the references
checked, and the verification performed.
