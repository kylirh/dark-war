/** Vertical alignment, reachable anchors, exact excavation, and deterministic regeneration. */
import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { stairBoundaryFor, prepareFallLanding } from "./vertical-layout";
import { generateDungeon, reachableFloorCount } from "./dungeon-generator";
import { RandomNumberGenerator, RNG } from "../utils/rng";
import { TileType } from "../types";
import { setStateTile } from "../utils/state-tiles";

describe("vertically aligned progression", () => {
  it.each([1, 7, 42, 99, 12345])(
    "keeps seed %s aligned through four floors, including surface",
    (worldSeed) => {
      const game = new Game({ worldSeed });
      game.reset(0);
      for (let depth = 1; depth <= 4; depth++) {
        const previousDown = [...game.getState().stairsDown];
        game.descend();
        const state = game.getState();
        expect(state.stairsUp).toEqual(previousDown);
        expect(state.tiles.getTile(...state.stairsUp!)).toBe(
          TileType.STAIRS_UP,
        );
        expect(state.stairsDown).not.toEqual(state.stairsUp);
        expect(state.tiles.getTile(...state.stairsDown)).toBe(
          TileType.STAIRS_DOWN,
        );
      }
    },
  );

  it("carves connected landings and stairs for many seeded layouts", () => {
    for (let seed = 0; seed < 30; seed++) {
      const upstairs = stairBoundaryFor(seed, 1, 128, 96);
      const downstairs = stairBoundaryFor(seed, 2, 128, 96);
      const dungeon = generateDungeon(
        128,
        96,
        2,
        new RandomNumberGenerator(seed),
        { upstairs, downstairs },
      );
      expect(dungeon.start).toEqual(upstairs);
      expect(dungeon.stairsDown).toEqual(downstairs);
      // Removing the down stair must reduce the reachable component by one.
      const before = reachableFloorCount(dungeon.map, 128, 96, upstairs);
      dungeon.map[downstairs[0] + downstairs[1] * 128] = TileType.WALL;
      expect(reachableFloorCount(dungeon.map, 128, 96, upstairs)).toBeLessThan(
        before,
      );
    }
  });

  it("generates the same next floor after save/load regardless of intervening rng use", () => {
    const game = new Game({ worldSeed: 777 });
    game.reset(1);
    const saved = JSON.parse(JSON.stringify(game.serialize()));
    game.descend();
    const expected = game.serialize();
    RNG.reseed(9123);
    const restored = new Game();
    restored.deserialize(saved);
    restored.descend();
    expect(restored.getState().stairsUp).toEqual(expected.stairsUp);
    expect(restored.getState().stairsDown).toEqual(expected.stairsDown);
    expect(restored.serialize().plane).toEqual(expected.plane);
  });

  it("opens the precise wall landing instead of relocating the player", () => {
    const game = new Game({ worldSeed: 17 });
    game.reset(2);
    const state = game.getState();
    setStateTile(state, 60, 50, TileType.WALL);
    expect(
      prepareFallLanding(state.worldPlane, [60, 50], state.stairsUp!),
    ).toBe(true);
    expect(state.tiles.getTile(60, 50)).toBe(TileType.FLOOR);
    setStateTile(state, 60, 50, TileType.HOLE);
    expect(
      prepareFallLanding(state.worldPlane, [60, 50], state.stairsUp!),
    ).toBe(true);
    expect(state.tiles.getTile(60, 50)).toBe(TileType.HOLE);
  });
});
