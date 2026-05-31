import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { EntityKind, ItemType, TileType, CELL_CONFIG } from "../../types";
import { RNG } from "../../utils/rng";
import { stepSimulationTick } from "./tick";

describe("magnetic auto-pickup", () => {
  beforeEach(() => RNG.reseed(123));

  it("pulls a nearby loose item to the player and collects it", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    // A coin ~50px to the right — inside the magnet radius, outside collect.
    const coin = new ItemEntity(player.gridX, player.gridY, ItemType.COIN);
    coin.worldX = player.worldX + 50;
    coin.worldY = player.worldY;
    coin.prevWorldX = coin.worldX;
    coin.prevWorldY = coin.worldY;
    state.entityManager.spawn(coin);
    const coinId = coin.id;

    // A handful of ticks should drift it in and collect it.
    for (let i = 0; i < 15; i++) stepSimulationTick(state);

    expect(state.entities.some((e) => e.id === coinId)).toBe(false);
  });

  it("ignores items beyond the magnet radius", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;

    const coin = new ItemEntity(player.gridX, player.gridY, ItemType.COIN);
    coin.worldX = player.worldX + 400; // far away
    coin.worldY = player.worldY;
    coin.prevWorldX = coin.worldX;
    coin.prevWorldY = coin.worldY;
    state.entityManager.spawn(coin);

    const before = coin.worldX;
    stepSimulationTick(state);
    expect(coin.worldX).toBe(before); // didn't move
  });
});

describe("items fall through holes", () => {
  beforeEach(() => RNG.reseed(7));

  it("removes a loose item resting on a hole tile", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();

    // Punch a hole a few tiles from the player and drop an item on it.
    const hx = state.player.gridX + 3;
    const hy = state.player.gridY;
    state.map[hx + hy * state.mapWidth] = TileType.HOLE;
    const item = new ItemEntity(hx, hy, ItemType.AMMO);
    item.worldX = hx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    item.worldY = hy * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    state.entityManager.spawn(item);
    const itemId = item.id;

    stepSimulationTick(state);

    expect(
      state.entities.some((e) => e.id === itemId && e.kind === EntityKind.ITEM),
    ).toBe(false);
  });
});
