import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { ItemType, CommandType, TileType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { setStateTile } from "../../utils/state-tiles";

function tileAt(game: Game, tileX: number, tileY: number): TileType {
  return game.getState().tiles.getTile(tileX, tileY);
}

function findTile(game: Game, tile: TileType): number {
  const state = game.getState();
  for (let index = 0; index < state.mapWidth * state.mapHeight; index++) {
    const x = index % state.mapWidth;
    const y = Math.floor(index / state.mapWidth);
    if (state.tiles.getTile(x, y) === tile) return index;
  }
  return -1;
}

function mine(game: Game, tileX: number, tileY: number) {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.MINE,
    data: { type: "MINE", tileX, tileY },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

function place(game: Game, tileX: number, tileY: number, itemType: ItemType) {
  const state = game.getState();
  enqueueCommand(state, {
    tick: state.sim.nowTick,
    actorId: state.player.id,
    type: CommandType.PLACE_BLOCK,
    data: { type: "PLACE_BLOCK", tileX, tileY, itemType },
    priority: 0,
    source: "PLAYER",
  });
  stepSimulationTick(state);
}

/** Position a wall tile one step to the player's right, within reach. */
function wallBesidePlayer(game: Game): { tileX: number; tileY: number } {
  const state = game.getState();
  const tileX = state.player.gridX + 1;
  const tileY = state.player.gridY;
  setStateTile(state, tileX, tileY, TileType.WALL);
  return { tileX, tileY };
}

describe("Matter Manipulator", () => {
  beforeEach(() => RNG.reseed(7));

  it("mines a wall into a block dropped on the ground (not auto-collected, no rubble)", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    const { tileX, tileY } = wallBesidePlayer(game);

    mine(game, tileX, tileY);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.FLOOR);
    // The block is dropped in-place, NOT added to the inventory.
    expect(state.player.itemCounts[ItemType.WALL_BLOCK] ?? 0).toBe(0);
    const dropped = state.entities.filter(
      (e) =>
        "type" in e && (e as { type: ItemType }).type === ItemType.WALL_BLOCK,
    );
    expect(dropped.length).toBe(1);
    expect(dropped[0].gridX).toBe(tileX);
    expect(dropped[0].gridY).toBe(tileY);
    // No rubble dropped from mining.
    const rubble = state.entities.filter(
      (e) =>
        "type" in e && (e as { type: ItemType }).type === ItemType.RUBBLE_CHUNK,
    );
    expect(rubble.length).toBe(0);
  });

  it("mines a door and a tree into their matching ground items", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    const doorX = state.player.gridX + 1;
    const doorY = state.player.gridY;
    const treeX = state.player.gridX;
    const treeY = state.player.gridY + 1;
    setStateTile(state, doorX, doorY, TileType.DOOR_CLOSED);
    setStateTile(state, treeX, treeY, TileType.TREE);

    mine(game, doorX, doorY);
    mine(game, treeX, treeY);

    const types = state.entities
      .filter((e) => "type" in e)
      .map((e) => (e as { type: ItemType }).type);
    expect(types).toContain(ItemType.DOOR);
    expect(types).toContain(ItemType.TREE_ITEM);
  });

  it("places a stored wall block back onto open floor", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    state.player.itemCounts[ItemType.WALL_BLOCK] = 2;

    const tileX = state.player.gridX + 1;
    const tileY = state.player.gridY;
    setStateTile(state, tileX, tileY, TileType.FLOOR);

    place(game, tileX, tileY, ItemType.WALL_BLOCK);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.WALL);
    expect(state.player.itemCounts[ItemType.WALL_BLOCK] ?? 0).toBe(1);
    expect(state.mapDirty).toBe(true);
  });

  it("places a holowall item as an indestructible holowall tile", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    state.player.itemCounts[ItemType.HOLOWALL] = 1;

    const tileX = state.player.gridX + 1;
    const tileY = state.player.gridY;
    setStateTile(state, tileX, tileY, TileType.FLOOR);

    place(game, tileX, tileY, ItemType.HOLOWALL);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.HOLOWALL);
    expect(state.player.itemCounts[ItemType.HOLOWALL] ?? 0).toBe(0);
  });

  it("refuses to place a non-placeable item", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    state.player.itemCounts[ItemType.COOKIE] = 3;

    const tileX = state.player.gridX + 1;
    const tileY = state.player.gridY;
    setStateTile(state, tileX, tileY, TileType.FLOOR);

    place(game, tileX, tileY, ItemType.COOKIE);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.FLOOR);
    expect(state.player.itemCounts[ItemType.COOKIE] ?? 0).toBe(3);
  });

  it("mines a light fixture from the surface and can place it again", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0); // surface
    const state = game.getState();
    state.player.hasMatterManipulator = true;

    // Find a real LIGHT tile on the surface (they line the avenues).
    const lightIdx = findTile(game, TileType.LIGHT);
    expect(lightIdx).toBeGreaterThanOrEqual(0);
    const lx = lightIdx % state.mapWidth;
    const ly = Math.floor(lightIdx / state.mapWidth);
    // Teleport the player next to it so the mine is in reach.
    state.player.worldX = (lx - 1) * 32 + 16;
    state.player.worldY = ly * 32 + 16;

    mine(game, lx, ly);
    expect(state.tiles.getTile(lx, ly)).not.toBe(TileType.LIGHT);
    const drops = state.entities.filter(
      (e) =>
        "type" in e &&
        (e as { type: ItemType }).type === ItemType.LIGHT_FIXTURE,
    );
    expect(drops.length).toBe(1);

    // And it can be placed back down.
    state.player.itemCounts[ItemType.LIGHT_FIXTURE] = 1;
    const px = state.player.gridX + 1;
    const py = state.player.gridY;
    setStateTile(state, px, py, TileType.FLOOR);
    place(game, px, py, ItemType.LIGHT_FIXTURE);
    expect(tileAt(game, px, py)).toBe(TileType.LIGHT);
  });

  it("puts lights on the surface but never generates them in dungeons", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    expect(findTile(game, TileType.LIGHT)).toBeGreaterThanOrEqual(0);

    game.reset(1); // dungeon
    expect(findTile(game, TileType.LIGHT)).toBe(-1);
  });

  it("cannot mine a holowall — it stays intact", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    const tileX = state.player.gridX + 1;
    const tileY = state.player.gridY;
    setStateTile(state, tileX, tileY, TileType.HOLOWALL);

    mine(game, tileX, tileY);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.HOLOWALL);
    expect(state.player.itemCounts[ItemType.WALL_BLOCK] ?? 0).toBe(0);
  });

  it("does nothing without the Matter Manipulator", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = false;
    const { tileX, tileY } = wallBesidePlayer(game);

    mine(game, tileX, tileY);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.WALL);
  });

  it("won't place a block out of reach", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    state.player.hasMatterManipulator = true;
    state.player.itemCounts[ItemType.WALL_BLOCK] = 1;

    const tileX = state.player.gridX + 40;
    const tileY = state.player.gridY;
    setStateTile(state, tileX, tileY, TileType.FLOOR);

    place(game, tileX, tileY, ItemType.WALL_BLOCK);

    expect(tileAt(game, tileX, tileY)).toBe(TileType.FLOOR);
    expect(state.player.itemCounts[ItemType.WALL_BLOCK] ?? 0).toBe(1);
  });
});
