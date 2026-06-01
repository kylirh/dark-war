import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { MonsterEntity } from "../../entities/monster-entity";
import { ItemEntity } from "../../entities/item-entity";
import { EntityKind, MonsterType, ItemType, TileType } from "../../types";
import { idxFor } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import { stepSimulationTick } from "./tick";

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("dreadnaught smashes through walls", () => {
  beforeEach(() => RNG.reseed(2));

  it("breaks a wall standing between it and the player", () => {
    const game = new Game({ mode: "offline" });
    game.reset(7);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;

    // Put a wall just to the player's right and the dreadnaught beyond it.
    const wx = player.gridX + 1;
    const wy = player.gridY;
    const wIdx = idxFor(wx, wy, state.mapWidth);
    state.map[wIdx] = TileType.WALL;
    state.map[idxFor(wx + 1, wy, state.mapWidth)] = TileType.FLOOR;

    const tank = new MonsterEntity(wx + 1, wy, MonsterType.DREADNAUGHT, 7);
    state.entityManager.spawn(tank);

    for (let i = 0; i < 40; i++) stepSimulationTick(state);

    // The wall has been smashed into floor (or at least heavily damaged).
    expect(state.map[wIdx]).not.toBe(TileType.WALL);
  });
});

describe("utility bot tidies junk", () => {
  beforeEach(() => RNG.reseed(2));

  it("removes nearby rubble/trash from the floor", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;

    const bot = new MonsterEntity(
      player.gridX + 2,
      player.gridY,
      MonsterType.UTILITY_BOT,
      1,
    );
    state.entityManager.spawn(bot);

    const trash = new ItemEntity(
      player.gridX + 2,
      player.gridY + 1,
      ItemType.TRASH,
    );
    state.entityManager.spawn(trash);
    const trashId = trash.id;

    for (let i = 0; i < 120; i++) {
      stepSimulationTick(state);
      if (!state.entities.some((e) => e.id === trashId)) break;
    }

    expect(state.entities.some((e) => e.id === trashId)).toBe(false);
  });
});
