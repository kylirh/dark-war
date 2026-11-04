import { describe, it, expect } from "vitest";
import {
  EntityKind,
  ItemType,
  Monster,
  MonsterType,
  TileType,
} from "../../types";
import { FlatTileSource } from "../../core/tile-source";
import { Game } from "../../core/game";
import { ItemEntity } from "../../entities/item-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import { clearMonsters } from "./test-utils";
import {
  directionFromAngle,
  normalizeAngle,
  hasClearLineOfSight,
  isTileOccupiedByActor,
  positiveAmount,
  canActorAct,
} from "./sim-helpers";

describe("canActorAct", () => {
  it("returns false for dead players", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);

    const player = game.getState().players[0];
    player.hp = 0;
    expect(canActorAct(game.getState(), player.id, 0)).toBe(false);
  });

  it("returns false for dead monsters", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);

    const monster = game
      .getState()
      .entities.find((e) => e.kind === EntityKind.MONSTER) as Monster;
    expect(monster).toBeDefined();
    monster.hp = 0;
    expect(canActorAct(game.getState(), monster.id, 0)).toBe(false);
  });
});

describe("positiveAmount", () => {
  it("floors a positive value to a positive integer", () => {
    expect(positiveAmount(3.9, 1)).toBe(3);
    expect(positiveAmount(0.4, 5)).toBe(1); // clamped to at least 1
  });

  it("uses the fallback for undefined / non-positive / non-finite", () => {
    expect(positiveAmount(undefined, 8)).toBe(8);
    expect(positiveAmount(0, 8)).toBe(8);
    expect(positiveAmount(-3, 8)).toBe(8);
    expect(positiveAmount(NaN, 8)).toBe(8);
  });
});

describe("directionFromAngle", () => {
  it("maps cardinal angles to unit steps", () => {
    expect(directionFromAngle(0)).toEqual([1, 0]);
    expect(directionFromAngle(Math.PI / 2)).toEqual([0, 1]);
    expect(directionFromAngle(Math.PI)).toEqual([-1, 0]);
    expect(directionFromAngle(-Math.PI / 2)).toEqual([0, -1]);
  });

  it("maps diagonal angles", () => {
    expect(directionFromAngle(Math.PI / 4)).toEqual([1, 1]);
    expect(directionFromAngle((3 * Math.PI) / 4)).toEqual([-1, 1]);
  });

  it("rounds to the nearest of eight directions", () => {
    expect(directionFromAngle(0.1)).toEqual([1, 0]);
    expect(directionFromAngle(Math.PI / 2 - 0.1)).toEqual([0, 1]);
  });
});

describe("normalizeAngle", () => {
  it("keeps angles already in range", () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  it("wraps angles into (-PI, PI]", () => {
    expect(normalizeAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeAngle(-(3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2);
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
  });
});

describe("hasClearLineOfSight", () => {
  const W = 8;
  const H = 3;
  const source = (map: TileType[]) => new FlatTileSource(map, W, H);
  const openRow = () => new Array(W * H).fill(TileType.FLOOR);
  const center = (gx: number) => gx * 32 + 16;

  it("is clear across open floor", () => {
    const map = openRow();
    expect(
      hasClearLineOfSight(
        source(map),
        center(1),
        center(1),
        center(6),
        center(1),
      ),
    ).toBe(true);
  });

  it("is blocked by an opaque wall between the endpoints", () => {
    const map = openRow();
    map[3 + 1 * W] = TileType.WALL; // opaque tile in the path
    expect(
      hasClearLineOfSight(
        source(map),
        center(1),
        center(1),
        center(6),
        center(1),
      ),
    ).toBe(false);
  });

  it("ignores opaque tiles exactly at the endpoints", () => {
    const map = openRow();
    map[1 + 1 * W] = TileType.WALL; // start cell
    map[6 + 1 * W] = TileType.WALL; // end cell
    expect(
      hasClearLineOfSight(
        source(map),
        center(1),
        center(1),
        center(6),
        center(1),
      ),
    ).toBe(true);
  });
});

/**
 * `isTileOccupiedByActor` is the single source for "may something stand here"
 * across six call sites (`commands.ts` x3, `events.ts`, `tick.ts`, `ai.ts`)
 * plus `isMonsterMoveCandidateClear` in its own module. Before these cases,
 * forcing it to always report "free" failed exactly one test in the whole
 * suite — `matter-manipulator.test.ts > refuses to place a block on an
 * occupied tile` — which left three decisions unguarded: that items and other
 * non-actors do not count, that both coordinates are compared, and the
 * `excludeId` branch.
 *
 * `excludeId` is reachable but never decisive: every caller asks about a
 * neighbour tile, so no mover is on the tile it asks about. These cases pin
 * the semantics rather than observed behaviour, so a future caller that does
 * test its own tile inherits a defined answer.
 */
describe("isTileOccupiedByActor", () => {
  /** A level with the generated monsters removed, so only the player acts. */
  function soloWorld(): Game {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    clearMonsters(game);
    return game;
  }

  it("reports the player's own tile and neither neighbour", () => {
    const state = soloWorld().getState();
    const { gridX, gridY } = state.player;

    expect(isTileOccupiedByActor(state, gridX, gridY)).toBe(true);
    // Both coordinates matter: a match on one axis alone is not occupancy.
    expect(isTileOccupiedByActor(state, gridX + 1, gridY)).toBe(false);
    expect(isTileOccupiedByActor(state, gridX, gridY + 1)).toBe(false);
  });

  it("reports a monster", () => {
    const game = soloWorld();
    const state = game.getState();
    const x = state.player.gridX + 2;
    const y = state.player.gridY + 2;

    expect(isTileOccupiedByActor(state, x, y)).toBe(false);
    state.entityManager.spawn(new MonsterEntity(x, y, MonsterType.WILD_DOG, 1));
    expect(isTileOccupiedByActor(state, x, y)).toBe(true);
  });

  it("ignores an item on the tile", () => {
    const game = soloWorld();
    const state = game.getState();
    const x = state.player.gridX + 3;
    const y = state.player.gridY;

    state.entityManager.spawn(new ItemEntity(x, y, ItemType.MEDKIT));
    expect(isTileOccupiedByActor(state, x, y)).toBe(false);
  });

  it("skips the excluded actor without excusing the tile", () => {
    const game = soloWorld();
    const state = game.getState();
    const x = state.player.gridX + 4;
    const y = state.player.gridY;

    const mover = new MonsterEntity(x, y, MonsterType.WILD_DOG, 1);
    state.entityManager.spawn(mover);
    expect(isTileOccupiedByActor(state, x, y, mover.id)).toBe(false);

    // A second actor on the same tile is still reported: the exclusion is one
    // id, not a blanket pass for the coordinate.
    state.entityManager.spawn(new MonsterEntity(x, y, MonsterType.WILD_DOG, 1));
    expect(isTileOccupiedByActor(state, x, y, mover.id)).toBe(true);
  });
});
