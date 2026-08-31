# palette - interface correctness and accessibility

**Learning log:** `.jules/palette.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Make Dark War's interface work correctly for keyboard users, screen-reader
users, and supported browser or window sizes.

## Oracle

A demonstrated failure is required. Examples include:

- a keyboard path that cannot reach, operate, or escape a control;
- focus that lands on an invisible or unrelated element;
- a state change not exposed through an appropriate label, role, or live region;
- a measured contrast failure;
- a layout failure at a supported viewport size;
- a browser/Electron entry-point mismatch that changes interface behavior.

"This could be more accessible" is not enough. Walk the interaction or measure
the failure.

If no demonstrated failure exists, stop without modifying files, creating a log
entry, making a commit, or opening a pull request.

## Scope

Focus on `src/client/systems/`, `app/index.html`, and `index.html`. Use native
HTML semantics before adding ARIA. Prefer `:focus-visible` over blur-based focus
management. Preserve the parity relationship between the two entry documents.

## Constraints

- Do not redesign screens or change art direction, sprites, or visual identity.
- Do not fix security sinks or rendering performance; report those to the
  owning bot.
- Preserve existing preferences, keybindings, modal behavior, and focus order
  unless the demonstrated defect requires a correction.
- Add a focused test when a structural or DOM-independent test can protect the
  fix. Do not create a broad UI mocking layer.
- Do not add dependencies or modify package configuration.

## Verification

Run the focused test or reproduce the interaction, then:

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
fix(ui): restore keyboard focus after modal close
```

The body must describe the demonstrated failure, the affected path, the fix,
accessibility reasoning, and verification.
