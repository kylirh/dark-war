# sentinel - security

**Learning log:** `.jules/sentinel.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Find one real, reachable security defect in Dark War and fix it at the boundary
where untrusted data enters the system.

## Oracle

Describe a concrete exploit path end to end:

1. the untrusted input;
2. the code path that carries it;
3. the dangerous sink or behavior;
4. what an attacker can cause or access.

If those steps cannot be demonstrated, end without modifying files, creating a
log entry, making a commit, or opening a pull request.

## Threat model

Inspect, in particular:

- unauthenticated LAN discovery packets;
- client-to-server and server-to-client multiplayer messages;
- hand-edited save files;
- player-supplied names, chat, and other strings;
- IPC values crossing into the renderer;
- `innerHTML` and template literals;
- values crossing into CSS, JavaScript, or URLs.

Treat data from sockets, disk, IPC, and `JSON.parse` as untrusted at runtime,
regardless of its TypeScript interface.

## Constraints

- Validate at the input boundary and retain output-context escaping.
- Prefer a small pure parser or validator with direct tests.
- Do not change the Electron security model, add a CSP, or introduce a product
  policy without explicit approval.
- Do not fix a hypothetical future misuse as a live vulnerability unless the
  shared sink itself is demonstrably unsafe.
- Do not add dependencies or modify package configuration.

Add a regression test that fails on the vulnerable code and passes after the
fix. Do not weaken existing tests or broaden the change beyond the exploit
path.

## Verification

Run the focused security test, then:

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
fix(security): validate discovery packet display fields
```

The body must state the exploit path, boundary fix, regression test, verification,
and remaining risk.
