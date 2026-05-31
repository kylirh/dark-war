# Dark War — Roadmap & Progress

Living checklist for the big "4 variants + content" effort. Update the status
boxes as work lands so any contributor (human or AI) can resume. See
`ARCHITECTURE.md` for the target structure and rationale.

Status key: `[ ]` todo · `[~]` in progress / partial · `[x]` done

---

## Phase 0 — Planning & docs

- [x] `docs/ARCHITECTURE.md` (4-variant vision, ideal folder layout, LAN/web answers)
- [x] `docs/ROADMAP.md` (this file)

## Phase 1 — Tooling & hygiene

- [x] Prettier config matching the existing style; `npm run format` / `format:check`
- [x] Format-on-commit (pre-commit hook formats staged files like VS Code autosave)
- [x] Pin/freeze dependency versions (exact, no `^`/`~`) to reduce supply-chain risk
- [x] Quiet build console chatter (esbuild/vite logs) & address `npm audit`
- [ ] (later) lint pass — no linter configured yet; Prettier only for now

## Phase 2 — Asset generation pipeline

- [x] `tools/png.mjs` — dependency-free PNG decode/encode (zlib only)
- [x] `tools/gen-spritesheet.mjs` — extend `sprites.png` with new item/monster rows
- [x] `tools/gen-sounds.mjs` — synthesize new effect sounds (WAV)
- [x] `npm run gen:assets` wires both; regenerated PNG/sounds committed
- Note: art is intentionally simple/procedural placeholder; refine later.

## Phase 3 — Content: data layer

- [x] Extend `ItemType`, `WeaponType`, `MonsterType` enums
- [x] `content/item-defs.ts` registry (display name, sprite key, category, stack, flags)
- [x] `content/monster-defs.ts` registry (hp, speed, damage, behavior, loot, flags, spawn depth)
- [ ] starter loadout (pistol XOR laser; butcher knife; black pill) — pending player-init work
- [x] Wire sprite coords for every new item/monster

## Phase 4 — Content: item mechanics

- [x] Picked-up items land in the inventory (generic collection + counts + equip/armor)

- [x] Death loot **spread** (scatter drops so they're individually visible)
- [x] **Magnetic auto-pickup** (radius; items drift to player & are collected)
- [~] Items **fall through holes** (removed on fall; deposit-below deferred) to the level below
- [ ] Butcher knife (starter melee, not found in levels)
- [x] Laser pistol (equip on pickup, half-charged; drains/refills via power cells)
- [ ] Black pill (starter; eat → instant death; anyone who eats it dies)
- [ ] Cookie (eat → heal; befriends Snagglepuss)
- [x] Gyrojet SMG (light/fast spray)
- [x] Gyrojet Shotgun (6-pellet cone, short range, 4 ammo/blast)
- [~] Macro Metal Sword & Vibra Sword (collect/equip as melee; damage tier pending)
- [x] Macrometal jacket (flat armor / damage resistance)
- [x] Powercell (recharges CTDM + laser + panic; banked as item)
- [x] Coins, Bone, Metal Scraps, Rubble, Rocks, Trash (drops/economy/cleanup fodder)
- [ ] Rocks throwable; rubble→rock production on wall/floor damage
- [ ] Utility bot cleans rubble/rocks/scraps/trash
- [~] Panic button (collected + charged; warp action pending)
- [~] Holowall (collected; placement action pending)
- [ ] Vending machine (sells random items) — placed entity + buy interaction

## Phase 5 — Content: monsters

- [~] Giant Spider (melee; chance to stun/slow on hit)
- [x] Icky Lump (slow; breeds with a cap; drops coins)
- [x] Flutterbang (explodes like a grenade on death)
- [~] Wild Dog (befriend with bone(s); nameable; auto-attacks nearby foes; follows)
- [~] Snagglepuss (steals & flees; cookie befriends → fetches loot to you)
- [~] Moppet (self-heals + far sight done; steal/teleport pending)
- [x] Cybercop (near-invisible render; jail deferred)
- [~] Zyth (alien with laser gun)
- [~] Tentacular Horror (big, tough, multi-hit; deep levels)
- [~] Terrorist Collaborator (ranged guns+grenades mini-boss; deep levels)
- [~] Dreadnaught (wall-destroying tank; sees all; mini-boss; deep levels)
- [x] Depth-scaled spawn tables (minibosses & horrors on lower levels)

## Phase R — Restructure toward 4 variants (staged)

- [x] Scaffold workspace skeleton dirs + READMEs (`packages/*`, `apps/*`) — documented target
- [ ] R1: extract `packages/engine` (pure core) behind `@dark-war/engine`
- [ ] R2: extract `packages/net`
- [ ] R3: extract `packages/server-core`; `apps/server` dedicated executable (multi-room)
- [ ] R4: extract `packages/client` + `PlatformBridge`; `apps/electron` provides Electron bridge
- [ ] R5: `apps/web` static single-player build + manual server-join (no host/discovery)
- [ ] R6: `apps/arcade` (input map, attract mode, pacing) — last, per owner

> R1–R6 are deliberately deferred from the first content pass: they are large
> mechanical moves best done with an interactive build/playtest loop. The
> engine-purity rule (ARCHITECTURE.md) is enforced for new code so the move stays
> mechanical.

## Deferred / future (captured so nothing is lost)

- Jaunt Troopers (panic-button call-in); Cybercop jail level; full dog naming UI.
- Snagglepuss/Moppet inventory-theft UX polish; vending-machine economy balancing.
- Cross-seam A\* pathfinding on the toroidal outside world.
- Web client mixed-content guidance / QR LAN-join helper.

## Conventions reminder

- TypeScript strict; kebab-case files; named exports; no barrels.
- Commit messages end with the Co-Authored-By trailer.
- Keep `npm run type-check`, `npm test`, and `npm run build:ts` green per commit.
