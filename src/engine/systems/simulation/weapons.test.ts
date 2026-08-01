import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { EntityKind, WeaponType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { SoundEffect } from "../../content/sound-effects";
import { enqueueCommand, resolveCommand } from "./commands";
import { processEventQueue } from "./events";
import { stepSimulationTick } from "./tick";
import { selectPlayerWeaponCallout } from "../../content/player-weapon-callouts";

function emittingCommandId(
  weapon: WeaponType,
  situation: "reloaded" | "depleted",
  prefix: string = "weapon-test",
): string {
  for (let index = 0; index < 100; index++) {
    const id = `${prefix}-${index}`;
    if (selectPlayerWeaponCallout(weapon, situation, id)) return id;
  }
  throw new Error("Expected to find an emitting cosmetic command ID");
}

function fire(game: Game) {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.FIRE,
    data: { type: "FIRE", dx: 1, dy: 0 },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
  return state.entities.filter((e) => e.kind === EntityKind.BULLET);
}

describe("new weapon firing modes", () => {
  beforeEach(() => RNG.reseed(11));

  it.each([
    WeaponType.PISTOL,
    WeaponType.SMG,
    WeaponType.SHOTGUN,
    WeaponType.LASER,
    WeaponType.GRENADE,
    WeaponType.LAND_MINE,
  ])("does not add a story-log message when firing %s", (weapon) => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = weapon;
    player.ammo = 12;
    player.laserCharge = 50;
    player.grenades = 1;
    player.landMines = 1;
    player.facingAngle = 0;
    state.story.length = 0;

    resolveCommand(state, {
      id: `silent-${weapon}`,
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 1, dy: 0, weapon },
      priority: 0,
      source: "PLAYER",
    });
    processEventQueue(state);

    expect(state.story).toEqual([]);
  });

  it("shotgun fires a spread of pellets and eats ammo fast", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.SHOTGUN;
    player.ammo = 12;
    player.facingAngle = 0;

    const bullets = fire(game);
    expect(bullets.length).toBe(6); // pellets
    expect(player.ammo).toBe(8); // -4 per blast
    // Pellets fan out: not all on the same heading.
    const angles = new Set(
      bullets.map((b) => (b as any).facingAngle.toFixed(3)),
    );
    expect(angles.size).toBeGreaterThan(1);
    expect([
      SoundEffect.SHOTGUN_BLAST_1,
      SoundEffect.SHOTGUN_BLAST_2,
      SoundEffect.SHOTGUN_BLAST_3,
    ]).toContain(game.getState().pendingSounds.at(-1)?.effect);
  });

  it("shotgun refuses to fire with fewer than four shells", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.SHOTGUN;
    player.ammo = 3; // a partial shell is not enough for a blast
    player.facingAngle = 0;

    const bullets = fire(game);
    expect(bullets.length).toBe(0); // no pellets
    expect(player.ammo).toBe(3); // ammo untouched, not clamped to 0
  });

  it("shotgun fires with exactly four shells and empties", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.SHOTGUN;
    player.ammo = 4;
    player.facingAngle = 0;

    const bullets = fire(game);
    expect(bullets.length).toBe(6);
    expect(player.ammo).toBe(0);
  });

  it("laser drains charge instead of ammo", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.LASER;
    player.laserCharge = 50;
    player.ammo = 0;
    player.facingAngle = 0;

    const bullets = fire(game);
    expect(bullets.length).toBe(1);
    expect(player.laserCharge).toBe(45);
    expect(player.ammo).toBe(0);
    expect((bullets[0] as any).projectileType).toBe("laser");
    expect(Math.hypot(bullets[0].velocityX, bullets[0].velocityY)).toBe(3600);
    expect((bullets[0] as any).trailPoints).toHaveLength(1);
    expect((bullets[0] as any).maxRicochets).toBe(2);
    expect([
      SoundEffect.LASER_SHOOT_1,
      SoundEffect.LASER_SHOOT_2,
      SoundEffect.LASER_SHOOT_3,
      SoundEffect.LASER_SHOOT_4,
    ]).toContain(game.getState().pendingSounds.at(-1)?.effect);
  });

  it("laser refuses to fire when depleted", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.LASER;
    player.laserCharge = 0;
    player.facingAngle = 0;

    expect(fire(game).length).toBe(0);
    expect(game.getState().pendingSounds.at(-1)?.effect).toBe(
      SoundEffect.CLICK,
    );
  });

  it("occasionally emits a weapon-aware callout on a failed shot", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.LASER;
    player.laserCharge = 0;

    resolveCommand(state, {
      id: emittingCommandId(WeaponType.LASER, "depleted"),
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });

    expect(state.pendingCallouts).toHaveLength(1);
    expect(state.pendingCallouts[0].speakerId).toBe(player.id);
    if (state.pendingCallouts[0].kind !== "reaction") {
      expect([
        "I'm out!!",
        "Out of thunder!",
        "Uh… time out?",
        "Time to get personal!",
        "Fine. Old school.",
        "Okay… sword time.",
        "Guess we improvise...",
        "Well, that’s awkward...",
        "Anyone got batteries?",
      ]).toContain(state.pendingCallouts[0].text);
    }
  });

  it("enforces a 10-second cooldown after an emitted depleted callout", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.weapon = WeaponType.PISTOL;
    player.ammo = 0;

    const resolveDryFire = (id: string): void => {
      resolveCommand(state, {
        id,
        tick: state.sim.nowTick,
        actorId: player.id,
        type: CommandType.FIRE,
        data: { type: "FIRE", dx: 1, dy: 0 },
        priority: 0,
        source: "PLAYER",
      });
    };

    resolveDryFire(emittingCommandId(WeaponType.PISTOL, "depleted", "first"));
    expect(state.pendingCallouts).toHaveLength(1);

    state.sim.nowTick = 199;
    resolveDryFire(emittingCommandId(WeaponType.PISTOL, "depleted", "second"));
    expect(state.pendingCallouts).toHaveLength(1);

    state.sim.nowTick = 200;
    resolveDryFire(emittingCommandId(WeaponType.PISTOL, "depleted", "third"));
    expect(state.pendingCallouts).toHaveLength(2);
  });

  it("smg fires one round per shot", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.SMG;
    player.ammo = 5;
    player.facingAngle = 0;

    const bullets = fire(game);
    expect(bullets.length).toBe(1);
    expect(player.ammo).toBe(4);
    expect([SoundEffect.SMG_SHOOT_1, SoundEffect.SMG_SHOOT_2]).toContain(
      game.getState().pendingSounds.at(-1)?.effect,
    );
  });

  it("plays a randomized throw cue when the player throws a grenade", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.GRENADE;
    player.grenades = 1;
    player.facingAngle = 0;

    fire(game);

    expect([
      SoundEffect.THROW_1,
      SoundEffect.THROW_2,
      SoundEffect.THROW_3,
      SoundEffect.THROW_4,
      SoundEffect.THROW_5,
    ]).toContain(game.getState().pendingSounds.at(-1)?.effect);
  });
});
