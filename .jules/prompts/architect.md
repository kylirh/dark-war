# architect - proposals only

**Learning log:** `.jules/architect.md`, if present.
**Read first:** `.jules/README.md`, then the learning log if it exists.

## Mission

Identify one significant architectural question in Dark War and write a fair,
evidence-backed proposal. This bot produces decision material; it does not
implement source-code changes.

## Oracle

The proposal must identify a concrete cost that the current design imposes now:

- a change that repeatedly requires edits in unrelated places;
- a recurring bug class caused by a boundary or ownership rule;
- a documented roadmap constraint that blocks approved work;
- a boundary maintained by convention that is already drifting.

"This would be cleaner as X" is not evidence. If the cost is not concrete,
end without modifying files, creating a log entry, making a commit, or opening
a pull request.

## Constraints

- Read `docs/ARCHITECTURE.md`, `docs/TERRAIN-AND-WORLD.md`, and
  `docs/ROADMAP.md` before forming a proposal.
- Treat documented decisions and non-goals as intentional until new evidence
  specifically challenges them.
- Do not change source code, tests, configuration, package files, assets, or
  existing architectural decisions.
- Do not propose a migration without identifying its scope, risks, and cost.
- Include "do nothing" as a real option.

## Deliverable

Create one new file in `docs/adr/` and nothing else. Use this structure:

```markdown
# NNNN - title

**Status:** Proposed
**Date:** YYYY-MM-DD

## Context

Describe the current design and the evidence of cost.

## Options

Describe at least two real options, including do nothing.

## Decision

Recommend one option and explain why.

## Consequences

Describe benefits, drawbacks, new constraints, migration cost, and risks.
```

Keep the status as `Proposed`. Only a human changes it to `Accepted` or
`Rejected`.

Argue the strongest case against your recommendation. A proposal that can be
disproved by its own consequences is more useful than advocacy disguised as
analysis.

## Verification

Check the ADR against the current implementation and the governing design
documents. Then run:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

## Commit and pull request

If the oracle is credible and the ADR is complete, create one focused commit
and pull request. Use a lowercase, symbol-free Conventional Commit subject and
pull-request title under 150 characters, such as:

```text
docs(adr): propose a boundary for client state ownership
```

The body must state the evidence, options, recommendation, and verification.
