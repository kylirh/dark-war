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
- [x] starter loadout (pistol+ammo XOR half-charged laser; always butcher knife + black pill; no grenades/mines)
- [x] Wire sprite coords for every new item/monster

## Phase 4 — Content: item mechanics

- [x] Picked-up items land in the inventory (generic collection + counts + equip/armor)
- [x] Active-item USE system (left-click uses selected item); context-aware reload (R)
- [x] Medkits & power cells are carried + used on demand (not auto-applied)
- [x] Rocks & bones are throwable (bounce/friction/rest/drop; hit creatures)

- [x] Death loot **spread** (scatter drops so they're individually visible)
- [x] **Magnetic auto-pickup** (radius; items drift to player & are collected)
- [x] Items **fall through holes** and are deposited onto the level below (offline)
- [x] Butcher knife (starter melee, not found in levels)
- [x] Laser pistol (equip on pickup, half-charged; drains/refills via power cells)
- [x] Black pill (starter; eat → instant death). Monster-eats-pill deferred.
- [x] Cookie (eat → heal). Snagglepuss befriend deferred.
- [x] Gyrojet SMG (light/fast spray)
- [x] Gyrojet Shotgun (6-pellet cone, short range, 4 ammo/blast)
- [x] Macro Metal Sword & Vibra Sword (melee damage tiers 5/7)
- [x] Macrometal jacket (flat armor / damage resistance)
- [x] Powercell (recharges CTDM + laser + panic; banked as item)
- [x] Coins, Bone, Metal Scraps, Rubble, Rocks, Trash (drops/economy/cleanup fodder)
- [x] Rocks throwable; rubble→rock production when walls are destroyed
- [x] Utility bot cleans rubble/rocks/scraps/trash
- [x] Panic button (warps one level toward the surface; offline)
- [x] Holowall (deploys a wall on the faced floor tile)
- [x] Vending machine (spawns in dungeons; interact to buy for coins)

## Phase 5 — Content: monsters

- [x] Giant Spider (chance to envenom → movement slow on hit)
- [x] Icky Lump (slow; breeds with a cap; drops coins)
- [x] Flutterbang (explodes like a grenade on death)
- [x] Wild Dog (bone befriends; nameable; attacks foes + follows owner)
- [x] Snagglepuss (steals & flees; cookie befriends → fetches loot to you)
- [x] Moppet (steals coins, teleports when hit, self-heals, far sight)
- [x] Cybercop (near-invisible render; jail deferred)
- [x] Zyth (ranged alien; fights at range)
- [x] Tentacular Horror (multi-hit strikes; deep levels)
- [x] Terrorist Collaborator (ranged mini-boss; deep levels)
- [x] Dreadnaught (smashes walls toward the player; mini-boss; deep levels)
- [x] Depth-scaled spawn tables (minibosses & horrors on lower levels)

## Phase R — Restructure toward 4 variants (staged)

- [x] Scaffold workspace skeleton dirs + READMEs (`packages/*`, `apps/*`) — documented target
- [~] R1: engine purity **enforced** (src/engine-purity.test.ts); SoundEffect moved to
  content/ so engine imports no DOM. Physical git-mv into packages/engine remains
  (mechanical now; verify with electron-builder)
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
