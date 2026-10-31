import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMonsters } from "./test-utils";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { CommandType, EntityKind, EventType, MonsterType } from "../../types";
import { RNG } from "../../utils/rng";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";
import { processMonsterAbilities } from "./tick";
import { resolveCommand } from "./commands";

describe("icky lumps breed", () => {
  beforeEach(() => RNG.reseed(99));
  afterEach(() => vi.restoreAllMocks());

  it("reproduces asexually at the deliberately low configured frequency", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    // One lump next to the player's start room (open floor around it).
    const lump = new MonsterEntity(
      state.player.gridX,
      state.player.gridY + 1,
      MonsterType.ICKY_LUMP,
      1,
    );
    state.entityManager.spawn(lump);

    const chance = vi.spyOn(RNG, "chance").mockReturnValue(true);
    vi.spyOn(RNG, "int").mockReturnValue(0);
    processMonsterAbilities(state);

    const lumpCount = state.entities.filter(
      (e) =>
        e.kind === EntityKind.MONSTER &&
        (e as any).type === MonsterType.ICKY_LUMP,
    ).length;
    expect(chance).toHaveBeenCalledWith(0.0005);
    expect(lumpCount).toBe(2);
  });

  it("deals only half a point of damage to the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.armor = 0;
    const lump = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.ICKY_LUMP,
      1,
    );
    state.entityManager.spawn(lump);
    const hpBefore = player.hp;

    resolveCommand(state, {
      id: "weak-lump-hit",
      tick: state.sim.nowTick,
      actorId: lump.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: player.id },
      priority: 0,
      source: "AI",
    });
    processEventQueue(state);

    expect(player.hp).toBe(hpBefore - 0.5);
  });

  it("never damages another icky lump", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();
    const first = new MonsterEntity(5, 5, MonsterType.ICKY_LUMP, 1);
    const second = new MonsterEntity(6, 5, MonsterType.ICKY_LUMP, 1);
    state.entityManager.spawn(first);
    state.entityManager.spawn(second);
    const hpBefore = second.hp;

    resolveCommand(state, {
      id: "friendly-lumps",
      tick: state.sim.nowTick,
      actorId: first.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: second.id },
      priority: 0,
      source: "AI",
    });
    processEventQueue(state);

    expect(second.hp).toBe(hpBefore);
  });
});

describe("selfHeals monsters regenerate HP", () => {
  it("heals 1 HP every 20 ticks and caps at hpMax", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const moppet = new MonsterEntity(
      state.player.gridX + 5,
      state.player.gridY,
      MonsterType.MOPPET,
      1,
    );
    moppet.hp = moppet.hpMax - 1; // Needs healing
    state.entityManager.spawn(moppet);

    state.sim.nowTick = 19;
    processMonsterAbilities(state);
    expect(moppet.hp).toBe(moppet.hpMax - 1); // Not healed yet

    state.sim.nowTick = 20;
    processMonsterAbilities(state);
    expect(moppet.hp).toBe(moppet.hpMax); // Healed 1 HP

    state.sim.nowTick = 40;
    processMonsterAbilities(state);
    expect(moppet.hp).toBe(moppet.hpMax); // Does not exceed hpMax
  });
});

describe("flutterbang explodes on death", () => {
  beforeEach(() => RNG.reseed(5));

  it("produces an explosion effect when it dies", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const bat = new MonsterEntity(
      state.player.gridX + 5,
      state.player.gridY,
      MonsterType.FLUTTERBANG,
      1,
    );
    state.entityManager.spawn(bat);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: bat.id },
    });
    processEventQueue(state);

    expect(state.effects.some((e) => e.type === "explosion")).toBe(true);
  });

  it("does not produce an explosion effect when it dies from an explosion", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();

    const bat = new MonsterEntity(
      state.player.gridX + 5,
      state.player.gridY,
      MonsterType.FLUTTERBANG,
      1,
    );
    bat.grenades = 0; // flutterbangs don't drop grenades, but prevent logic from running it
    bat.landMines = 0;
    state.entityManager.spawn(bat);

    pushEvent(state, {
      type: EventType.DEATH,
      data: { type: "DEATH", entityId: bat.id, fromExplosion: true },
    });
    processEventQueue(state);

    expect(state.effects.some((e) => e.type === "explosion")).toBe(false);
  });
});

describe("stunsOnHit slows the player", () => {
  it("applies a slow effect to the player on hit if RNG succeeds", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    const monster = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.GIANT_SPIDER,
      1,
    );
    state.entityManager.spawn(monster);

    const chance = vi.spyOn(RNG, "chance").mockReturnValue(true);

    state.eventQueue.push({
      id: "test-stun",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: player.id,
        amount: 1,
        sourceId: monster.id,
      },
    });

    processEventQueue(state);

    expect(player.slowUntilTick).toBe(state.sim.nowTick + 40);
    expect(
      state.pendingAlerts.some(
        (a) => a.message === "Venom slows your movements!",
      ),
    ).toBe(true);
    chance.mockRestore();
  });

  it("does not apply a slow effect if RNG fails", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    const initialSlowUntilTick = player.slowUntilTick;

    const monster = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.GIANT_SPIDER,
      1,
    );
    state.entityManager.spawn(monster);

    const chance = vi.spyOn(RNG, "chance").mockReturnValue(false);

    state.eventQueue.push({
      id: "test-no-stun",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: player.id,
        amount: 1,
        sourceId: monster.id,
      },
    });

    processEventQueue(state);

    expect(player.slowUntilTick).toBe(initialSlowUntilTick);
    expect(
      state.pendingAlerts.some(
        (a) => a.message === "Venom slows your movements!",
      ),
    ).toBe(false);
    chance.mockRestore();
  });

  it("leaves the player unslowed when the attacker lacks the flag", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    const initialSlowUntilTick = player.slowUntilTick;

    // A wild dog carries flags, but not stunsOnHit, so it reaches the same
    // inner branch the spider does and must still fail the flag check.
    const monster = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.WILD_DOG,
      1,
    );
    state.entityManager.spawn(monster);

    const chance = vi.spyOn(RNG, "chance").mockReturnValue(true);

    state.eventQueue.push({
      id: "test-unflagged-attacker",
      depth: state.depth,
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: player.id,
        amount: 1,
        sourceId: monster.id,
      },
    });

    processEventQueue(state);

    expect(player.slowUntilTick).toBe(initialSlowUntilTick);
    expect(
      state.pendingAlerts.some(
        (a) => a.message === "Venom slows your movements!",
      ),
    ).toBe(false);
    chance.mockRestore();
  });
});
