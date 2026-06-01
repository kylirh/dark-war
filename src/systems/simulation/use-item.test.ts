import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemType, WeaponType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

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
});
