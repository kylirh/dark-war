import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import {
  CommandType,
  EntityKind,
  ItemType,
  TileType,
  WeaponType,
  WALL_MAX_DAMAGE,
} from "../../types";
import { MonsterEntity } from "../../entities/monster-entity";
import { MonsterType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand, resolveCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { applyWallDamageAt } from "../../utils/walls";
import { SoundEffect } from "../../content/sound-effects";
import { setStateTile } from "../../utils/state-tiles";
import { selectPlayerWeaponCallout } from "../../content/player-weapon-callouts";

function emittingReloadCommandId(
  weapon: WeaponType,
  situation: "reloaded" | "depleted" = "reloaded",
): string {
  for (let index = 0; index < 100; index++) {
    const id = `reload-test-${index}`;
    if (selectPlayerWeaponCallout(weapon, situation, id)) return id;
  }
  throw new Error("Expected to find an emitting cosmetic reload command ID");
}

function setActive(game: Game, type: ItemType) {
  const player = game.getState().player;
  player.selectedBarSlot = 0;
  player.inventorySlots[0] = { type };
}

function use(game: Game) {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.USE_ITEM,
    data: { type: "USE_ITEM", dx: 1, dy: 0 },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

function reload(game: Game) {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.RELOAD,
    data: { type: "RELOAD" },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

describe("using the active item", () => {
  beforeEach(() => RNG.reseed(3));

  it("eats a cookie to heal and consumes one", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.hp = 10;
    player.itemCounts[ItemType.COOKIE] = 2;
    setActive(game, ItemType.COOKIE);

    use(game);
    expect(player.hp).toBe(16);
    expect(player.itemCounts[ItemType.COOKIE]).toBe(1);
    expect([SoundEffect.EAT_1, SoundEffect.EAT_2]).toContain(
      game.getState().pendingSounds.at(-1)?.effect,
    );
  });

  it("uses a medkit to heal and consumes it", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.hp = 3;
    player.itemCounts[ItemType.MEDKIT] = 1;
    setActive(game, ItemType.MEDKIT);

    use(game);
    expect(player.hp).toBe(18); // +15
    expect(player.itemCounts[ItemType.MEDKIT] ?? 0).toBe(0);
    expect(player.inventorySlots[0].type).toBe(null); // slot cleared
    expect(
      game
        .getState()
        .pendingSounds.some(
          (sound) =>
            sound.effect === SoundEffect.HEAL_1 ||
            sound.effect === SoundEffect.HEAL_2,
        ),
    ).toBe(true);
  });

  it("swallowing the black pill is fatal", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    setActive(game, ItemType.BLACK_PILL);

    use(game);
    expect(player.hp).toBe(0);
  });

  it("uses a power cell to fully charge energy gear", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.laserCharge = 0;
    player.itemCounts[ItemType.POWERCELL] = 1;
    setActive(game, ItemType.POWERCELL);

    use(game);
    expect(player.laserCharge).toBe(player.laserChargeMax);
    expect(player.itemCounts[ItemType.POWERCELL] ?? 0).toBe(0);
    expect(game.getState().pendingSounds.at(-1)?.effect).toBe(
      SoundEffect.RECHARGE,
    );
  });
});

describe("reloading the active weapon", () => {
  beforeEach(() => RNG.reseed(3));

  it("refills a pistol magazine from reserve ammo", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.PISTOL;
    player.ammo = 0;
    player.ammoReserve = 24;
    setActive(game, ItemType.PISTOL);

    reload(game);
    expect(player.ammo).toBe(12);
    expect(player.ammoReserve).toBe(12);
  });

  it("charges the laser from a power cell", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.LASER;
    player.laserCharge = 0;
    player.itemCounts[ItemType.POWERCELL] = 1;
    setActive(game, ItemType.LASER_PISTOL);

    reload(game);
    expect(player.laserCharge).toBe(player.laserChargeMax);
    expect(player.itemCounts[ItemType.POWERCELL] ?? 0).toBe(0);
  });

  it("occasionally emits a weapon-aware callout after reloading", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.PISTOL;
    player.ammo = 0;
    player.ammoReserve = 12;
    setActive(game, ItemType.PISTOL);

    resolveCommand(state, {
      id: emittingReloadCommandId(WeaponType.PISTOL),
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.RELOAD,
      data: { type: "RELOAD" },
      priority: 0,
      source: "PLAYER",
    });

    expect(state.pendingCallouts).toHaveLength(1);
    expect(state.pendingCallouts[0]).toMatchObject({
      kind: "speech",
      speakerId: player.id,
    });
  });

  it("occasionally emits a depleted callout when reserve ammo is empty", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.SMG;
    player.ammo = 0;
    player.ammoReserve = 0;
    setActive(game, ItemType.GYROJET_SMG);

    resolveCommand(state, {
      id: emittingReloadCommandId(WeaponType.SMG, "depleted"),
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.RELOAD,
      data: { type: "RELOAD" },
      priority: 0,
      source: "PLAYER",
    });

    expect(state.pendingCallouts).toHaveLength(1);
    expect(state.pendingCallouts[0].speakerId).toBe(player.id);
  });
});

describe("holowall placement", () => {
  beforeEach(() => RNG.reseed(3));

  it("turns the floor tile in front of the player into an indestructible holowall", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.facingAngle = 0; // face +x
    const tx = player.gridX + 1;
    const ty = player.gridY;
    setStateTile(state, tx, ty, TileType.FLOOR);
    player.itemCounts[ItemType.HOLOWALL] = 1;
    setActive(game, ItemType.HOLOWALL);

    use(game);
    expect(state.tiles.getTile(tx, ty)).toBe(TileType.HOLOWALL);
    expect(player.itemCounts[ItemType.HOLOWALL] ?? 0).toBe(0);
    expect(state.mapDirty).toBe(true);
    expect(state.pendingSounds.at(-1)?.effect).toBe(SoundEffect.PLACE_WALL);
  });
});

describe("panic button", () => {
  beforeEach(() => RNG.reseed(3));

  it("plays the warp cue when escaping toward the surface", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    const state = game.getState();
    const player = state.player;
    player.panicCharge = player.panicChargeMax;
    setActive(game, ItemType.PANIC_BUTTON);

    use(game);

    expect(state.shouldAscend).toBe(true);
    expect(state.pendingSounds.at(-1)?.effect).toBe(SoundEffect.PANIC_BUTTON);
  });

  it("clicks when activation is attempted before it is charged", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    const state = game.getState();
    const player = state.player;
    player.panicCharge = player.panicChargeMax - 1;
    setActive(game, ItemType.PANIC_BUTTON);

    use(game);

    expect(state.shouldAscend).toBe(false);
    expect(state.pendingSounds.at(-1)?.effect).toBe(SoundEffect.CLICK);
  });

  it("a deployed holowall shrugs off wall damage", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const tx = 5;
    const ty = 5;
    setStateTile(state, tx, ty, TileType.HOLOWALL);

    const changed = applyWallDamageAt(state, tx, ty, WALL_MAX_DAMAGE * 2);
    expect(changed).toBe(false);
    expect(state.tiles.getTile(tx, ty)).toBe(TileType.HOLOWALL);
  });
});

describe("melee weapon damage tiers", () => {
  beforeEach(() => RNG.reseed(3));

  it.each([
    MonsterType.CYBERCOP,
    MonsterType.UTILITY_BOT,
    MonsterType.DREADNAUGHT,
  ])("plays a metal impact when melee hits a %s", (monsterType) => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    state.entityManager.destroyWhere(
      (entity) => entity.kind === EntityKind.MONSTER,
    );
    player.weapon = WeaponType.MELEE;
    player.facingAngle = 0;
    setActive(game, ItemType.BUTCHER_KNIFE);

    const robot = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      monsterType,
      1,
    );
    robot.hpMax = 100;
    robot.hp = 100;
    state.entityManager.spawn(robot);
    state.visible.add(robot.gridX + robot.gridY * state.mapWidth);

    use(game);

    expect(robot.hp).toBe(97);
    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.HIT_METAL_1 ||
          sound.effect === SoundEffect.HIT_METAL_2 ||
          sound.effect === SoundEffect.HIT_METAL_3 ||
          sound.effect === SoundEffect.HIT_METAL_4,
      ),
    ).toBe(true);
  });

  it("a vibra sword hits harder than fists and plays its swing cue", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.MELEE;
    player.facingAngle = 0;
    setActive(game, ItemType.VIBRA_SWORD);

    const foe = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.MUTANT,
      1,
    );
    foe.hpMax = 100;
    foe.hp = 100;
    state.entityManager.spawn(foe);

    use(game);
    expect(foe.hp).toBe(93); // 100 - 7 (vibra sword)
    const vibraSwordSounds = new Set<SoundEffect>([
      SoundEffect.VIBRA_SWORD_1,
      SoundEffect.VIBRA_SWORD_2,
      SoundEffect.VIBRA_SWORD_3,
      SoundEffect.VIBRA_SWORD_4,
      SoundEffect.VIBRA_SWORD_5,
      SoundEffect.VIBRA_SWORD_6,
      SoundEffect.VIBRA_SWORD_7,
    ]);
    expect(
      state.pendingSounds.some((sound) =>
        vibraSwordSounds.has(sound.effect as SoundEffect),
      ),
    ).toBe(true);
  });

  it("a macro metal sword plays one of its swing cues", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.MELEE;
    player.facingAngle = 0;
    setActive(game, ItemType.MACRO_METAL_SWORD);

    const foe = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.MUTANT,
      1,
    );
    foe.hpMax = 100;
    foe.hp = 100;
    state.entityManager.spawn(foe);

    use(game);

    expect(foe.hp).toBe(95);
    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.MACRO_METAL_SWORD_1 ||
          sound.effect === SoundEffect.MACRO_METAL_SWORD_2,
      ),
    ).toBe(true);
  });

  it("plays the miss cue when a melee swing hits empty air", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    state.entityManager.destroyWhere(
      (entity) => entity.kind === EntityKind.MONSTER,
    );
    player.weapon = WeaponType.MELEE;
    player.facingAngle = 0;
    state.tiles.setTile(player.gridX + 1, player.gridY, TileType.FLOOR);
    setActive(game, ItemType.BUTCHER_KNIFE);

    use(game);

    expect(state.pendingSounds.at(-1)?.effect).toBe(SoundEffect.MISS);
  });

  it("does not play the miss cue when a melee swing hits a wall", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    state.entityManager.destroyWhere(
      (entity) => entity.kind === EntityKind.MONSTER,
    );
    player.weapon = WeaponType.MELEE;
    player.facingAngle = 0;
    state.tiles.setTile(player.gridX + 1, player.gridY, TileType.WALL);
    setActive(game, ItemType.BUTCHER_KNIFE);

    use(game);

    expect(
      state.pendingSounds.some((sound) => sound.effect === SoundEffect.MISS),
    ).toBe(false);
  });
});
