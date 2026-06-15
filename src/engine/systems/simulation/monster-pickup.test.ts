import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { ItemEntity } from "../../entities/item-entity";
import { EntityKind, ItemType, MonsterType } from "../../types";
import { RNG } from "../../utils/rng";
import { processMonsterItemPickups } from "./tick";

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

function spawnMonsterAtPlayer(game: Game, type: MonsterType): MonsterEntity {
  const state = game.getState();
  const m = new MonsterEntity(state.player.gridX, state.player.gridY, type, 1);
  m.worldX = state.player.worldX;
  m.worldY = state.player.worldY;
  state.entityManager.spawn(m);
  return m;
}

function dropItemOn(
  game: Game,
  m: MonsterEntity,
  type: ItemType,
  amount?: number,
): ItemEntity {
  const state = game.getState();
  const item = new ItemEntity(m.gridX, m.gridY, type, amount);
  item.worldX = m.worldX;
  item.worldY = m.worldY;
  state.entityManager.spawn(item);
  return item;
}

describe("monsters only consume items they actually pick up", () => {
  // Force the per-item pickup roll so the overlap always resolves.
  beforeEach(() => {
    RNG.reseed(1);
    vi.spyOn(RNG, "chance").mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("leaves an un-carriable item type on the floor instead of deleting it", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    const coin = dropItemOn(game, spider, ItemType.COIN, 5);

    processMonsterItemPickups(state);

    // COIN has no pickup branch — it must be left alone, not silently destroyed.
    expect(state.entities.some((e) => e.id === coin.id)).toBe(true);
    expect(spider.carriedItems.length).toBe(0);
  });

  it("still consumes and carries a handled item type (keycard)", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    const card = dropItemOn(game, spider, ItemType.KEYCARD);

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === card.id)).toBe(false);
    expect(spider.carriedItems.some((c) => c.type === ItemType.KEYCARD)).toBe(
      true,
    );
  });
});

describe("ranged monsters reload from ammo pickups", () => {
  beforeEach(() => {
    RNG.reseed(1);
    vi.spyOn(RNG, "chance").mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("a zyth reloads its bullets instead of just stashing the ammo", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const zyth = spawnMonsterAtPlayer(game, MonsterType.ZYTH);
    zyth.bullets = 0;
    const ammo = dropItemOn(game, zyth, ItemType.AMMO, 8);

    processMonsterItemPickups(state);

    expect(zyth.bullets).toBeGreaterThan(0);
    expect(zyth.carriedItems.some((c) => c.type === ItemType.AMMO)).toBe(false);
    expect(state.entities.some((e) => e.id === ammo.id)).toBe(false);
  });
});
