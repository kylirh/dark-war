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

  it("lets monsters carry generic items from a player death drop", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    const coin = dropItemOn(game, spider, ItemType.COIN, 5);
    coin.deathDrop = true;

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === coin.id)).toBe(false);
    expect(
      spider.carriedItems.some(
        (carried) => carried.type === ItemType.COIN && carried.amount === 5,
      ),
    ).toBe(true);
  });

  it("does not allow monsters with cannotCarryItems flag to pick up items", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const dog = spawnMonsterAtPlayer(game, MonsterType.WILD_DOG);
    const bone = dropItemOn(game, dog, ItemType.BONE);
    bone.deathDrop = true;

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === bone.id)).toBe(true);
    expect(dog.carriedItems.length).toBe(0);
  });
});

describe("monster health and medkits", () => {
  beforeEach(() => {
    RNG.reseed(1);
    vi.spyOn(RNG, "chance").mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("fleeing monsters pick up medkits from a larger radius to heal", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    spider.hpMax = 20;
    spider.hp = 4; // 20% max HP, so it's fleeing (<= 25%)

    // Drop medkit outside normal 24px radius, but within 48px radius
    const medkit = dropItemOn(game, spider, ItemType.MEDKIT);
    medkit.heal = 10;
    medkit.worldX = spider.worldX + 40;
    medkit.worldY = spider.worldY;

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === medkit.id)).toBe(false);
    expect(spider.hp).toBe(14); // 4 + 10 = 14
  });

  it("non-fleeing monsters ignore medkits", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    spider.hpMax = 20;
    spider.hp = 10; // 50% max HP, not fleeing

    const medkit = dropItemOn(game, spider, ItemType.MEDKIT);

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === medkit.id)).toBe(true);
    expect(spider.hp).toBe(10);
  });
});

describe("explosives", () => {
  beforeEach(() => {
    RNG.reseed(1);
    vi.spyOn(RNG, "chance").mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("monsters can pick up grenades and land mines", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    spider.grenades = 0;
    spider.landMines = 0;

    const grenade = dropItemOn(game, spider, ItemType.GRENADE, 3);
    // Ensure item amount is defined for positiveAmount()
    grenade.amount = 3;

    // Offset land mine slightly so it doesn't share exact coordinate
    const landMine = dropItemOn(game, spider, ItemType.LAND_MINE, 2);
    landMine.amount = 2;
    landMine.worldX += 1;

    processMonsterItemPickups(state);

    expect(state.entities.some((e) => e.id === grenade.id)).toBe(false);
    expect(state.entities.some((e) => e.id === landMine.id)).toBe(false);
    expect(spider.grenades).toBe(3);
    expect(spider.landMines).toBe(2);
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

  it("non-ranged monsters stash ammo in carried items instead of reloading", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const spider = spawnMonsterAtPlayer(game, MonsterType.GIANT_SPIDER);
    spider.bullets = 0;
    const ammo = dropItemOn(game, spider, ItemType.AMMO, 8);

    processMonsterItemPickups(state);

    expect(spider.bullets).toBe(0);
    expect(
      spider.carriedItems.some(
        (c) => c.type === ItemType.AMMO && c.amount === 8,
      ),
    ).toBe(true);
    expect(state.entities.some((e) => e.id === ammo.id)).toBe(false);
  });
});

describe("weapon-adaptive monsters", () => {
  beforeEach(() => {
    RNG.reseed(1);
    vi.spyOn(RNG, "chance").mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([MonsterType.ZYTH, MonsterType.TERRORIST_COLLABORATOR])(
    "%s equips a better weapon and drops its old one",
    (monsterType) => {
      const game = new Game({ mode: "offline" });
      game.reset(1);
      clearMonsters(game);
      const state = game.getState();
      const monster = spawnMonsterAtPlayer(game, monsterType);
      const smg = dropItemOn(game, monster, ItemType.GYROJET_SMG);

      processMonsterItemPickups(state);

      expect(monster.equippedWeapon).toBe(ItemType.GYROJET_SMG);
      expect(state.entities.some((entity) => entity.id === smg.id)).toBe(false);
      expect(
        state.entities.some(
          (entity) =>
            entity.kind === EntityKind.ITEM &&
            (entity as ItemEntity).type === ItemType.PISTOL,
        ),
      ).toBe(true);
    },
  );

  it("leaves an inferior weapon on the floor", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();
    const zyth = spawnMonsterAtPlayer(game, MonsterType.ZYTH);
    zyth.equippedWeapon = ItemType.LASER_PISTOL;
    const pistol = dropItemOn(game, zyth, ItemType.PISTOL);

    processMonsterItemPickups(state);

    expect(zyth.equippedWeapon).toBe(ItemType.LASER_PISTOL);
    expect(state.entities.some((entity) => entity.id === pistol.id)).toBe(true);
  });

  it("powercells recharge an adaptive monster's laser pistol", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const zyth = spawnMonsterAtPlayer(game, MonsterType.ZYTH);
    zyth.equippedWeapon = ItemType.LASER_PISTOL;
    zyth.laserCharge = 0;

    const cell = dropItemOn(game, zyth, ItemType.POWERCELL);

    processMonsterItemPickups(state);

    expect(zyth.laserCharge).toBe(100);
    expect(state.entities.some((entity) => entity.id === cell.id)).toBe(false);
  });

  it("powercells are stashed by non-laser adaptive monsters", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const zyth = spawnMonsterAtPlayer(game, MonsterType.ZYTH);
    zyth.equippedWeapon = ItemType.GYROJET_SMG;
    zyth.laserCharge = 0;

    const cell = dropItemOn(game, zyth, ItemType.POWERCELL, 25);

    processMonsterItemPickups(state);

    expect(zyth.laserCharge).toBe(0);
    expect(
      zyth.carriedItems.some(
        (c) => c.type === ItemType.POWERCELL && c.amount === 25,
      ),
    ).toBe(true);
    expect(state.entities.some((entity) => entity.id === cell.id)).toBe(false);
  });
});
