/**
 * Integration coverage for adaptive monster weapon selection and firing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { SoundEffect } from "../../content/sound-effects";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { ItemEntity } from "../../entities/item-entity";
import {
  Bullet,
  CommandType,
  EntityKind,
  ItemType,
  MonsterType,
  WeaponType,
} from "../../types";
import { weaponTypeForItem } from "../../utils/inventory";
import {
  isMonsterPrimaryWeapon,
  monsterWeaponScore,
} from "../../utils/monster-weapons";
import { RNG } from "../../utils/rng";
import { generateAICommands, updateMonsterSteering } from "./ai";
import { resolveCommand } from "./commands";
import { processMonsterItemPickups } from "./tick";

const PRIMARY_WEAPONS = [
  ItemType.PISTOL,
  ItemType.BUTCHER_KNIFE,
  ItemType.LASER_PISTOL,
  ItemType.GYROJET_SMG,
  ItemType.GYROJET_SHOTGUN,
  ItemType.MACRO_METAL_SWORD,
  ItemType.VIBRA_SWORD,
] as const;

function createArmedMonster(
  game: Game,
  monsterType: MonsterType,
  weapon: ItemType,
): MonsterEntity {
  const state = game.getState();
  state.entityManager.destroyWhere(
    (entity) => entity.kind === EntityKind.MONSTER,
  );
  const monster = new MonsterEntity(
    state.player.gridX,
    state.player.gridY,
    monsterType,
    4,
  );
  monster.worldX = state.player.worldX;
  monster.worldY = state.player.worldY;
  monster.equippedWeapon = weapon;
  monster.bullets = 20;
  monster.laserCharge = 100;
  monster.grenades = 0;
  monster.landMines = 0;
  state.entityManager.spawn(monster);
  return monster;
}

describe("adaptive monster weapon catalog", () => {
  it.each(PRIMARY_WEAPONS)("assigns a combat value to %s", (weapon) => {
    expect(isMonsterPrimaryWeapon(weapon)).toBe(true);
    expect(monsterWeaponScore(weapon)).toBeGreaterThan(0);
  });
});

describe("adaptive monster AI", () => {
  beforeEach(() => RNG.reseed(7));

  it.each([MonsterType.ZYTH, MonsterType.TERRORIST_COLLABORATOR])(
    "%s fires its equipped ranged weapon",
    (monsterType) => {
      const game = new Game({ mode: "offline" });
      game.reset(4);
      const monster = createArmedMonster(
        game,
        monsterType,
        ItemType.GYROJET_SMG,
      );

      const command = generateAICommands(game.getState(), 0).find(
        (candidate) => candidate.actorId === monster.id,
      );

      expect(command?.type).toBe(CommandType.FIRE);
      expect(command?.data).toMatchObject({ weapon: WeaponType.SMG });
    },
  );

  it.each([MonsterType.ZYTH, MonsterType.TERRORIST_COLLABORATOR])(
    "%s uses an equipped melee weapon at close range",
    (monsterType) => {
      const game = new Game({ mode: "offline" });
      game.reset(4);
      const monster = createArmedMonster(
        game,
        monsterType,
        ItemType.VIBRA_SWORD,
      );

      const command = generateAICommands(game.getState(), 0).find(
        (candidate) => candidate.actorId === monster.id,
      );

      expect(command?.type).toBe(CommandType.MELEE);
    },
  );

  it("seeks a nearby power cell when its laser is depleted", () => {
    const game = new Game({ mode: "offline" });
    game.reset(4);
    const state = game.getState();
    const monster = createArmedMonster(
      game,
      MonsterType.ZYTH,
      ItemType.LASER_PISTOL,
    );
    monster.worldX = state.player.worldX + 5 * 32;
    monster.laserCharge = 0;
    const powerCell = new ItemEntity(
      monster.gridX + 2,
      monster.gridY,
      ItemType.POWERCELL,
    );
    state.entityManager.spawn(powerCell);

    updateMonsterSteering(state);

    expect(monster.velocityX).toBeGreaterThan(0);
  });

  it("does not consume a power cell when its laser is already full", () => {
    const game = new Game({ mode: "offline" });
    game.reset(4);
    const state = game.getState();
    const monster = createArmedMonster(
      game,
      MonsterType.ZYTH,
      ItemType.LASER_PISTOL,
    );
    monster.laserCharge = 100;
    const powerCell = new ItemEntity(
      monster.gridX,
      monster.gridY,
      ItemType.POWERCELL,
    );
    powerCell.worldX = monster.worldX;
    powerCell.worldY = monster.worldY;
    state.entityManager.spawn(powerCell);

    for (let attempt = 0; attempt < 5; attempt++) {
      processMonsterItemPickups(state);
    }

    expect(state.entities.some((entity) => entity.id === powerCell.id)).toBe(
      true,
    );
  });
});

describe("adaptive monster weapon persistence", () => {
  it("preserves species, equipped weapon, and laser charge across a save", () => {
    const game = new Game({ mode: "offline" });
    game.reset(4);
    const monster = createArmedMonster(
      game,
      MonsterType.TERRORIST_COLLABORATOR,
      ItemType.LASER_PISTOL,
    );
    monster.laserCharge = 55;

    const restored = new Game({ mode: "offline" });
    restored.deserialize(game.serialize());
    const restoredMonster = restored
      .getState()
      .entities.find((entity) => entity.id === monster.id);

    expect(restoredMonster?.kind).toBe(EntityKind.MONSTER);
    expect(restoredMonster).toMatchObject({
      type: MonsterType.TERRORIST_COLLABORATOR,
      equippedWeapon: ItemType.LASER_PISTOL,
      laserCharge: 55,
    });
  });
});

describe("adaptive monster ranged attacks", () => {
  beforeEach(() => RNG.reseed(11));

  it.each([
    [ItemType.PISTOL, SoundEffect.SHOOT, 1, 1],
    [ItemType.GYROJET_SMG, null, 1, 1],
    [ItemType.GYROJET_SHOTGUN, null, 6, 4],
    [ItemType.LASER_PISTOL, null, 1, 0],
  ] as const)(
    "uses %s mechanics and sound",
    (weaponItem, expectedSound, projectileCount, ammoCost) => {
      const game = new Game({ mode: "offline" });
      game.reset(4);
      const state = game.getState();
      const monster = createArmedMonster(game, MonsterType.ZYTH, weaponItem);
      monster.worldX = state.player.worldX + 64;
      const bulletsBefore = monster.bullets;

      resolveCommand(state, {
        id: crypto.randomUUID(),
        tick: state.sim.nowTick,
        actorId: monster.id,
        type: CommandType.FIRE,
        data: {
          type: "FIRE",
          dx: 0,
          dy: 0,
          weapon: weaponTypeForItem(weaponItem),
        },
        priority: 1,
        source: "AI",
      });

      const projectiles = state.entities.filter(
        (entity): entity is Bullet =>
          entity.kind === EntityKind.BULLET && entity.ownerId === monster.id,
      );
      expect(projectiles).toHaveLength(projectileCount);
      expect(monster.bullets).toBe(bulletsBefore - ammoCost);

      const sound = state.pendingSounds.at(-1)?.effect;
      if (weaponItem === ItemType.LASER_PISTOL) {
        expect([
          SoundEffect.LASER_SHOOT_1,
          SoundEffect.LASER_SHOOT_2,
          SoundEffect.LASER_SHOOT_3,
          SoundEffect.LASER_SHOOT_4,
        ]).toContain(sound);
      } else if (weaponItem === ItemType.GYROJET_SMG) {
        expect([SoundEffect.SMG_SHOOT_1, SoundEffect.SMG_SHOOT_2]).toContain(
          sound,
        );
      } else if (weaponItem === ItemType.GYROJET_SHOTGUN) {
        expect([
          SoundEffect.SHOTGUN_BLAST_1,
          SoundEffect.SHOTGUN_BLAST_2,
          SoundEffect.SHOTGUN_BLAST_3,
        ]).toContain(sound);
      } else {
        expect(sound).toBe(expectedSound);
      }
      if (weaponItem === ItemType.LASER_PISTOL) {
        expect(projectiles[0].projectileType).toBe("laser");
        expect(monster.laserCharge).toBe(95);
      }
    },
  );
});
