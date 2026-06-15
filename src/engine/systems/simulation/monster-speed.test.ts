import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { EntityKind, MonsterType, TileType, CELL_CONFIG } from "../../types";
import { RNG } from "../../utils/rng";
import { setTileFor } from "../../utils/helpers";
import { MONSTER_DEFS } from "../../content/monster-defs";
import { MONSTER_SPEED } from "./constants";
import { updateMonsterSteering } from "./ai";

// Spawn one monster `tiles` cells east of the player on a carved-clear row (so
// line of sight is guaranteed), run a single steering pass, and return the
// resulting chase speed (velocity magnitude).
function chaseSpeed(type: MonsterType, tiles = 3): number {
  const game = new Game({ mode: "offline" });
  game.reset(1);
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
  const state = game.getState();
  RNG.reseed(7);

  const p = state.player;
  const gy = p.gridY;
  const gx = p.gridX + tiles;
  for (let x = p.gridX - 1; x <= gx + 1; x++) {
    setTileFor(state.map, x, gy, state.mapWidth, TileType.FLOOR);
  }

  const m = new MonsterEntity(gx, gy, type, 1);
  m.worldX = gx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
  m.worldY = gy * CELL_CONFIG.h + CELL_CONFIG.h / 2;
  m.hp = m.hpMax; // healthy => chasing, not fleeing
  state.entityManager.spawn(m);

  updateMonsterSteering(state);
  return Math.hypot(m.velocityX, m.velocityY);
}

describe("monster steering honors the per-definition speed multiplier", () => {
  it("a monster configured faster chases proportionally faster", () => {
    const slow = chaseSpeed(MonsterType.MUTANT); // speed 1.0
    const fast = chaseSpeed(MonsterType.FLUTTERBANG); // speed 1.6

    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(fast / slow).toBeCloseTo(
      MONSTER_DEFS[MonsterType.FLUTTERBANG].speed /
        MONSTER_DEFS[MonsterType.MUTANT].speed,
      1,
    );
  });

  it("chase speed equals MONSTER_SPEED times the def multiplier", () => {
    expect(chaseSpeed(MonsterType.FLUTTERBANG)).toBeCloseTo(
      MONSTER_SPEED * MONSTER_DEFS[MonsterType.FLUTTERBANG].speed,
      3,
    );
  });
});
