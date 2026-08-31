# jules bot prompts

Each bot has a standing prompt in `.jules/prompts/<name>.md`. Learning logs in
`.jules/<name>.md` are optional, append-only context for substantive findings.
The prompt is the source of truth for the bot. A log never overrides the
repository instructions or the design documents.

## bot roster

| bot       | responsibility                                                | oracle                                                     |
| --------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| sentinel  | security defects at untrusted-input boundaries                | a concrete, reachable exploit path                         |
| invariant | determinism, serialization, and netcode properties            | a failing property or invariant test                       |
| bug       | reproduced correctness defects                                | a failing regression test before the fix                   |
| palette   | interface operability and accessibility                       | a demonstrated interaction or standards failure            |
| bolt      | measured runtime or resource improvements                     | a reproducible before/after measurement                    |
| janitor   | dead code, duplication, simplification, and proven small debt | an objective deletion, duplication, or simplification case |
| test      | missing or weak behavioral coverage                           | a named decision or edge case the test would catch         |
| scribe    | incorrect or missing contract documentation                   | a wrong or materially incomplete contract                  |
| architect | architectural decision records                                | a documented cost imposed by the current design            |
| world     | terrain, generation, and world-integrity behavior             | a failing world property or reproducible semantic mismatch |
| alpha     | first-session player path and supported-target smoke coverage | a reproducible player-facing failure                       |

Each invocation has one owner, one problem, and one proposed pull request at
most. The general rules below apply to every bot.

## shared rules

1. Read `AGENTS.md` and the relevant files in `docs/` before editing. The
   repository instructions and design documents are authoritative.
2. Inspect the current branch, recent commits, learning logs, and open pull
   requests when those are available. Do not duplicate an existing change or
   modify a file already being changed by another bot.
3. Select one narrow problem. Do not bundle adjacent cleanup, speculative
   refactors, or unrelated fixes.
4. An oracle is mandatory. If the bot cannot produce the oracle described by
   its prompt, stop without modifying files, creating a log entry, making a
   commit, or opening a pull request.
5. Do not weaken tests, hide failures, invent measurements, or change a
   documented non-goal into an implementation.
6. Preserve the current behavior, deterministic simulation, entity lifecycle,
   engine purity, save behavior, and multiplayer contracts unless the bot's
   prompt explicitly owns that behavior.
7. Do not add dependencies or modify `package.json`, `package-lock.json`, or
   TypeScript configuration unless a human explicitly requests it.
8. Run the relevant focused checks, then run the full repository checks:

   ```bash
   npm run format:check
   npm test
   npm run type-check
   npm run build:ts
   git diff --check
   ```

   Report only commands that were actually run. Do not fix unrelated failures.

9. Add a learning-log entry only when the work produces a substantive,
   codebase-specific lesson. Never create a log entry solely to describe an
   empty result.
10. If a pull request is created, make exactly one focused commit when
    practical. The commit subject and pull-request title must both use
    lowercase Conventional Commit form, contain no decorative symbols, and be
    fewer than 150 characters:

    ```text
    <type>(<scope>): <imperative description>
    ```

    The pull-request body may be longer so it can contain the oracle,
    verification, risks, and deliberately excluded work. Keep its headings
    lowercase and preserve the required casing of code identifiers and
    commands.

11. A pull request must not be used to report an empty result. If the oracle
    is absent, end without a commit, pull request, or log update.

## architecture boundaries

- `src/engine/` is platform-independent and must not import DOM, Pixi,
  Electron, `ws`, Node modules, or platform globals.
- `state.tiles` is the canonical tile accessor. Do not reintroduce scalar
  runtime maps or editor IDs as gameplay state.
- `worldX` and `worldY` are authoritative. `gridX` and `gridY` are derived and
  read-only.
- Entity lifecycle goes through `state.entityManager`; do not mutate
  `state.entities` directly.
- Use deterministic RNG for gameplay logic. Preserve entity ordering when it
  can affect RNG consumption or observable behavior.
- Compatibility with old saves, worlds, and network clients is not a goal for
  this unreleased game. Do not add compatibility scaffolding unless requested.

## pull-request review

The reviewer should merge only when the oracle is credible, the diff is within
the bot's scope, the relevant checks pass, and the change respects the
authoritative design documents. Otherwise, request narrowly scoped changes,
close the pull request, or record a decision for human review. Never merge an
architectural or product-direction change merely because it is technically
plausible.
