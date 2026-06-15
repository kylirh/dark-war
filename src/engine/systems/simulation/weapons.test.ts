import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { EntityKind, WeaponType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

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
  });

  it("laser refuses to fire when depleted", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const player = game.getState().player;
    player.weapon = WeaponType.LASER;
    player.laserCharge = 0;
    player.facingAngle = 0;

    expect(fire(game).length).toBe(0);
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
  });
});
