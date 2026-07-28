import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import {
  EntityKind,
  MonsterType,
  ItemType,
  CommandType,
  EventType,
  WeaponType,
  TileType,
  CELL_CONFIG,
} from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { SoundEffect } from "../../content/sound-effects";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";
import { updateMonsterSteering } from "./ai";

const GIANT_SPIDER_SOUNDS = new Set<string>([
  SoundEffect.GIANT_SPIDER_1,
  SoundEffect.GIANT_SPIDER_2,
  SoundEffect.GIANT_SPIDER_3,
  SoundEffect.GIANT_SPIDER_4,
  SoundEffect.GIANT_SPIDER_5,
]);
const ICKY_LUMP_HIT_SOUNDS = new Set<string>([
  SoundEffect.ICKY_LUMP_HIT_1,
  SoundEffect.ICKY_LUMP_HIT_2,
  SoundEffect.ICKY_LUMP_HIT_3,
]);
const ICKY_LUMP_MOVEMENT_SOUNDS = new Set<string>([
  SoundEffect.ICKY_LUMP_MOVE_1,
  SoundEffect.ICKY_LUMP_MOVE_2,
  SoundEffect.ICKY_LUMP_MOVE_3,
  SoundEffect.ICKY_LUMP_MOVE_4,
]);

function hasGiantSpiderSound(state: ReturnType<Game["getState"]>): boolean {
  return state.pendingSounds.some((sound) =>
    GIANT_SPIDER_SOUNDS.has(sound.effect),
  );
}

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("multi-hit creatures", () => {
  beforeEach(() => RNG.reseed(1));

  it("a tentacular horror's strike deals its damage several times", () => {
    const game = new Game({ mode: "offline" });
    game.reset(6);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.armor = 0;
    player.hpMax = 999;
    player.hp = 999;
    const hp0 = player.hp;

    const horror = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.TENTACULAR_HORROR,
      6,
    );
    horror.nextActTick = 0;
    state.entityManager.spawn(horror);

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: horror.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: player.id },
      priority: 0,
      source: "AI",
    });
    stepSimulationTick(state);

    // 3x its per-hit damage (multiHit: 3) — far more than a single bite.
    expect(hp0 - player.hp).toBe(horror.dmg * 3);
  });
});

describe("creature attack sounds", () => {
  beforeEach(() => RNG.reseed(1));

  it("randomly uses an Icky Lump hit cue when it attacks", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const monster = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      MonsterType.ICKY_LUMP,
      2,
    );
    state.entityManager.spawn(monster);

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: monster.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: state.player.id },
      priority: 0,
      source: "AI",
    });
    stepSimulationTick(state);

    expect(
      state.pendingSounds.some((sound) =>
        ICKY_LUMP_HIT_SOUNDS.has(sound.effect),
      ),
    ).toBe(true);
  });

  it("uses the gyrojet pistol cue for a Zyth ranged attack", () => {
    const game = new Game({ mode: "offline" });
    game.reset(4);
    clearMonsters(game);
    const state = game.getState();
    const zyth = new MonsterEntity(
      state.player.gridX + 3,
      state.player.gridY,
      MonsterType.ZYTH,
      4,
    );
    zyth.bullets = 1;
    state.entityManager.spawn(zyth);

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: zyth.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 0, dy: 0, weapon: WeaponType.PISTOL },
      priority: 0,
      source: "AI",
    });
    stepSimulationTick(state);

    expect(
      state.pendingSounds.some((sound) => sound.effect === SoundEffect.SHOOT),
    ).toBe(true);
  });

  it("plays a randomized teleport cue when a moppet blinks after being hit", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    clearMonsters(game);
    const state = game.getState();
    const moppet = new MonsterEntity(
      state.player.gridX + 1,
      state.player.gridY,
      MonsterType.MOPPET,
      3,
    );
    moppet.hp = 100;
    moppet.hpMax = 100;
    state.entityManager.spawn(moppet);

    for (let attempt = 0; attempt < 20; attempt++) {
      pushEvent(state, {
        type: EventType.DAMAGE,
        data: {
          type: "DAMAGE",
          targetId: moppet.id,
          amount: 0,
          sourceId: state.player.id,
          suppressHitSound: true,
        },
      });
      processEventQueue(state);
      if (
        state.pendingSounds.some(
          (sound) =>
            sound.effect === SoundEffect.MOPPET_TELEPORT_1 ||
            sound.effect === SoundEffect.MOPPET_TELEPORT_2,
        )
      ) {
        break;
      }
    }

    expect(
      state.pendingSounds.some(
        (sound) =>
          sound.effect === SoundEffect.MOPPET_TELEPORT_1 ||
          sound.effect === SoundEffect.MOPPET_TELEPORT_2,
      ),
    ).toBe(true);
  });
});

describe("Giant Spider ambience", () => {
  beforeEach(() => RNG.reseed(13));
  afterEach(() => vi.restoreAllMocks());

  it("plays a spatial randomized cue when a spider becomes nearby", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const spider = new MonsterEntity(
      state.player.gridX + 4,
      state.player.gridY,
      MonsterType.GIANT_SPIDER,
      2,
    );
    state.entityManager.spawn(spider);
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    expect(hasGiantSpiderSound(state)).toBe(true);
    const sound = state.pendingSounds.find((pending) =>
      GIANT_SPIDER_SOUNDS.has(pending.effect),
    );
    expect(sound?.worldX).toBe(spider.worldX);
    expect(sound?.worldY).toBe(spider.worldY);
  });

  it("allows a moving spider to repeat sooner than an idle spider", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const spider = new MonsterEntity(
      state.player.gridX + 4,
      state.player.gridY,
      MonsterType.GIANT_SPIDER,
      2,
    );
    state.entityManager.spawn(spider);
    updateMonsterSteering(state);
    state.pendingSounds.length = 0;
    state.sim.nowTick += 80;
    vi.spyOn(RNG, "chance").mockReturnValue(true);
    spider.velocityX = 0;
    spider.velocityY = 0;

    updateMonsterSteering(state);

    expect(hasGiantSpiderSound(state)).toBe(false);
    spider.velocityX = 20;
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    expect(hasGiantSpiderSound(state)).toBe(true);
  });
});

describe("Icky Lump movement sounds", () => {
  beforeEach(() => RNG.reseed(17));
  afterEach(() => vi.restoreAllMocks());

  it("plays a spatial cue while approaching a nearby player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const lump = new MonsterEntity(
      state.player.gridX + 4,
      state.player.gridY,
      MonsterType.ICKY_LUMP,
      2,
    );
    lump.velocityX = -20;
    state.entityManager.spawn(lump);
    state.pendingSounds.length = 0;

    updateMonsterSteering(state);

    const sound = state.pendingSounds.find((pending) =>
      ICKY_LUMP_MOVEMENT_SOUNDS.has(pending.effect),
    );
    expect(sound?.worldX).toBe(lump.worldX);
    expect(sound?.worldY).toBe(lump.worldY);
  });

  it("occasionally repeats while continuing toward the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const lump = new MonsterEntity(
      state.player.gridX + 4,
      state.player.gridY,
      MonsterType.ICKY_LUMP,
      2,
    );
    lump.velocityX = -20;
    state.entityManager.spawn(lump);
    updateMonsterSteering(state);
    state.pendingSounds.length = 0;
    state.sim.nowTick += 100;
    lump.velocityX = -20;
    vi.spyOn(RNG, "chance").mockReturnValue(true);

    updateMonsterSteering(state);

    expect(
      state.pendingSounds.some((sound) =>
        ICKY_LUMP_MOVEMENT_SOUNDS.has(sound.effect),
      ),
    ).toBe(true);
  });
});

describe("Flutterbang ambience", () => {
  beforeEach(() => RNG.reseed(23));

  it("plays spatial fluttering through an intervening wall", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    clearMonsters(game);
    const state = game.getState();
    const flutterbang = new MonsterEntity(
      state.player.gridX + 4,
      state.player.gridY,
      MonsterType.FLUTTERBANG,
      3,
    );
    state.tiles.setTile(
      state.player.gridX + 1,
      state.player.gridY,
      TileType.WALL,
    );
    state.entityManager.spawn(flutterbang);

    updateMonsterSteering(state);

    expect(state.pendingSounds).toContainEqual({
      effect: SoundEffect.FLUTTER,
      worldX: flutterbang.worldX,
      worldY: flutterbang.worldY,
    });
    expect(flutterbang.nextFlutterbangAmbienceTick).toBeGreaterThanOrEqual(30);
    expect(flutterbang.nextFlutterbangAmbienceTick).toBeLessThanOrEqual(60);
  });

  it("is silent beyond the spatial hearing range", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    clearMonsters(game);
    const state = game.getState();
    const flutterbang = new MonsterEntity(
      state.player.gridX,
      state.player.gridY,
      MonsterType.FLUTTERBANG,
      3,
    );
    flutterbang.worldX = state.player.worldX + CELL_CONFIG.w * 18;
    flutterbang.worldY = state.player.worldY;
    state.entityManager.spawn(flutterbang);

    updateMonsterSteering(state);

    expect(
      state.pendingSounds.some((sound) => sound.effect === SoundEffect.FLUTTER),
    ).toBe(false);
  });
});

describe("thieves steal and flee", () => {
  beforeEach(() => RNG.reseed(5));

  it("a moppet grabs coins and turns to flee", () => {
    const game = new Game({ mode: "offline" });
    game.reset(3);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.hpMax = 999;
    player.hp = 999; // survive long enough to be robbed
    player.itemCounts[ItemType.COIN] = 10;

    const moppet = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.MOPPET,
      3,
    );
    state.entityManager.spawn(moppet);

    for (let i = 0; i < 120; i++) {
      stepSimulationTick(state);
      if (moppet.fleeing) break;
    }

    expect(moppet.fleeing).toBe(true);
    expect(player.itemCounts[ItemType.COIN] ?? 0).toBeLessThan(10);
    expect(moppet.carriedItems.some((c) => c.type === ItemType.COIN)).toBe(
      true,
    );
  });
});
