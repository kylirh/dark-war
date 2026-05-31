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

- [ ] Prettier config matching the existing style; `npm run format` / `format:check`
- [ ] Format-on-commit (pre-commit hook formats staged files like VS Code autosave)
- [ ] Pin/freeze dependency versions (exact, no `^`/`~`) to reduce supply-chain risk
- [ ] Quiet build console chatter (esbuild/vite logs) & address `npm audit`
- [ ] (later) lint pass — no linter configured yet; Prettier only for now

## Phase 2 — Asset generation pipeline

- [ ] `tools/png.mjs` — dependency-free PNG decode/encode (zlib only)
- [ ] `tools/gen-spritesheet.mjs` — extend `sprites.png` with new item/monster rows
- [ ] `tools/gen-sounds.mjs` — synthesize new effect sounds (WAV)
- [ ] `npm run gen:assets` wires both; regenerated PNG/sounds committed
- Note: art is intentionally simple/procedural placeholder; refine later.

## Phase 3 — Content: data layer

- [ ] Extend `ItemType`, `WeaponType`, `MonsterType` enums
- [ ] `content/items.ts` registry (display name, sprite key, category, stack, effects)
- [ ] `content/monsters.ts` registry (hp, speed, damage, sight, loot, flags, spawn depth)
- [ ] `content/loadout.ts` starter loadout (pistol XOR laser; butcher knife; black pill)
- [ ] Wire sprite coords for every new item/monster

## Phase 4 — Content: item mechanics

- [ ] Death loot **spread** (scatter drops so they're individually visible)
- [ ] **Magnetic auto-pickup** (radius; items drift to player & are collected)
- [ ] Items **fall through holes** to the level below
- [ ] Butcher knife (starter melee, not found in levels)
- [ ] Laser pistol (starter alt; starts half-charged; powers up via power cells)
- [ ] Black pill (starter; eat → instant death; anyone who eats it dies)
- [ ] Cookie (eat → heal; befriends Snagglepuss)
- [ ] Gyrojet SMG (auto-fire spray)
- [ ] Gyrojet Shotgun (spread, slower, heavier ammo use)
- [ ] Macro Metal Sword & Vibra Sword (stronger melee)
- [ ] Macrometal jacket (armor / damage resistance)
- [ ] Powercell (energy for laser/panic button/CTDM)
- [ ] Coins, Bone, Metal Scraps, Rubble, Rocks, Trash (drops/economy/cleanup fodder)
- [ ] Rocks throwable; rubble→rock production on wall/floor damage
- [ ] Utility bot cleans rubble/rocks/scraps/trash
- [ ] Panic button (warp to a level closer to entrance; charges via power cells)
- [ ] Holowall (place → spawns a wall tile)
- [ ] Vending machine (sells random items) — placed entity + buy interaction

## Phase 5 — Content: monsters

- [ ] Giant Spider (melee; chance to stun/slow on hit)
- [ ] Icky Lump (slow, weak, breeds/multiplies, may drop coin, won't fight own kind)
- [ ] Flutterbang (fast suicide bomber bat; bites then may explode)
- [ ] Wild Dog (befriend with bone(s); nameable; auto-attacks nearby foes; follows)
- [ ] Snagglepuss (steals & flees; cookie befriends → fetches loot to you)
- [ ] Moppet (teleports when hit; trips/steals money; far sight; self-heals; smiley)
- [ ] Cybercop (near-invisible in combat; jail mechanic deferred)
- [ ] Zyth (alien with laser gun)
- [ ] Tentacular Horror (big, tough, multi-hit; deep levels)
- [ ] Terrorist Collaborator (ranged guns+grenades mini-boss; deep levels)
- [ ] Dreadnaught (wall-destroying tank; sees all; mini-boss; deep levels)
- [ ] Depth-scaled spawn tables (minibosses & horrors on lower levels)

## Phase R — Restructure toward 4 variants (staged)

- [ ] Scaffold workspace skeleton dirs + READMEs (`packages/*`, `apps/*`) — documented target
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
