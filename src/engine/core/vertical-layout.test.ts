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

  // The anchors are drawn per boundary, so a floor's own up and down stairs are
  // two independent draws. Alternating x parity by depth is what keeps them from
  // landing on the same cell and collapsing a floor into a single stairwell.
  it("never puts a floor's up and down anchors on the same cell", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let depth = 1; depth <= 8; depth++) {
        const upstairs = stairBoundaryFor(seed, depth - 1, 128, 96);
        const downstairs = stairBoundaryFor(seed, depth, 128, 96);
        expect(downstairs).not.toEqual(upstairs);
        expect(downstairs[0]).not.toBe(upstairs[0]);
      }
    }
  });

  it("keeps every anchor inside the excavatable interior", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let depth = 0; depth <= 8; depth++) {
        const [x, y] = stairBoundaryFor(seed, depth, 128, 96);
        expect(Number.isSafeInteger(x)).toBe(true);
        expect(Number.isSafeInteger(y)).toBe(true);
        // `prepareFallLanding` refuses the sealed border ring outright.
        expect(x).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(0);
        expect(x).toBeLessThan(127);
        expect(y).toBeLessThan(95);
      }
    }
  });

  it("derives anchors from seed and depth alone, not from visit order", () => {
    // Repeated draws for one boundary agree, so a floor generated on the way
    // down and again after a save/load lands its stairs on the same cell.
    for (let depth = 0; depth <= 8; depth++) {
      expect(stairBoundaryFor(2026, depth, 128, 96)).toEqual(
        stairBoundaryFor(2026, depth, 128, 96),
      );
    }
    // Depth 0 is the authored surface entrance, shared by every seed. Two
    // unequal seeds are not otherwise required to disagree at a given depth.
    expect(stairBoundaryFor(1, 0, 128, 96)).toEqual(
      stairBoundaryFor(999, 0, 128, 96),
    );
  });

  // Anchors are two draws from a generator seeded per boundary, so they inherit
  // whatever the generator's opening draws carry. When those draws ignored the
  // seed, every world put a floor's stairwell on one cell: depth 1 landed on the
  // same y in all 2000 world seeds sampled.
  it("spreads anchors across the map for different world seeds", () => {
    for (const depth of [1, 2, 5]) {
      const xs = new Set<number>();
      const ys = new Set<number>();
      const cells = new Set<string>();
      for (let seed = 0; seed < 200; seed++) {
        const [x, y] = stairBoundaryFor(seed, depth, 128, 96);
        xs.add(x);
        ys.add(y);
        cells.add(`${x},${y}`);
      }
      expect(xs.size).toBeGreaterThan(20);
      expect(ys.size).toBeGreaterThan(20);
      expect(cells.size).toBeGreaterThan(100);
    }
  });

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
