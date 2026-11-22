/** Exercises the normal command and simulation paths for cultivation. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  WATERING_CAN_CAPACITY,
  WATER_DURATION,
  WILT_AFTER,
} from "../../content/crop-defs";
import { Game } from "../../core/game";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../../core/world-semantics";
import {
  Command,
  CommandType,
  EntityKind,
  GameState,
  ItemType,
} from "../../types";
import { setPositionFromGrid } from "../../utils/helpers";
import { applyStateDelta, computeStateDelta } from "../../../net/state-delta";
import { resolveCommand } from "./commands";
import { getWaterTarget } from "./farming";
import { stepSimulationTick } from "./tick";
import { SIM_DT_MS } from "./constants";

const X = 14;
const Y = 58;
let game: Game;
let state: GameState;

function command(type: CommandType, data: Command["data"]): void {
  resolveCommand(state, {
    id: "farm-test",
    actorId: state.player.id,
    tick: state.sim.nowTick,
    type,
    data,
    priority: 0,
    source: "PLAYER",
  });
}

function use(item: ItemType, x: number, y: number): void {
  const existingSlot = state.player.inventorySlots.findIndex(
    ({ type }) => type === item,
  );
  if (existingSlot >= 0) state.player.selectedBarSlot = existingSlot;
  else {
    state.player.inventorySlots[0] = { type: item };
    state.player.selectedBarSlot = 0;
  }
  command(CommandType.USE_ITEM, {
    type: "USE_ITEM",
    dx: 0,
    dy: 0,
    targetWorldX: x * 32 + 16,
    targetWorldY: y * 32 + 16,
  });
}

function advance(seconds: number): void {
  for (let tick = 0; tick < (seconds * 1000) / SIM_DT_MS; tick++)
    stepSimulationTick(state);
}

function plot(x = X, y = Y) {
  return state.worldPlane.plots.get(state.worldPlane.indexFor(x, y));
}

beforeEach(() => {
  game = new Game({ worldSeed: 321 });
  game.reset(0);
  state = game.getState();
  state.entityManager.destroyWhere(
    (entity) => entity.kind !== EntityKind.PLAYER,
  );
  for (let y = Y - 2; y <= Y + 2; y++) {
    for (let x = X - 2; x <= X + 8; x++) {
      state.worldPlane.editCell(x, y, {
        ground: GroundType.GRASS,
        elevation: 0,
        structure: StructureType.NONE,
        fixture: FixtureType.NONE,
      });
    }
  }
  setPositionFromGrid(state.player, X - 1, Y);
});

describe("farming", () => {
  it.each([
    [ItemType.CORN_SEED, ItemType.CORN, 8, 14],
    [ItemType.POTATO_SEED, ItemType.POTATO, 6, 12],
  ] as const)(
    "grows %s through each stage, regrows twice, and yields edible produce",
    (seed, produce, duration, regrowth) => {
      use(seed, X, Y);
      expect(plot()).toBeUndefined();
      use(ItemType.HOE, X, Y);
      use(seed, X, Y);
      expect(state.player.itemCounts[seed]).toBe(2);
      expect(plot()?.crop?.stage).toBe("seed");

      for (const stage of ["seedling", "small", "medium", "full", "ripe"]) {
        use(ItemType.WATERING_CAN, X, Y);
        advance(duration);
        expect(plot()?.crop?.stage).toBe(stage);
      }
      advance(WATER_DURATION + WILT_AFTER + 1);
      expect(plot()?.crop?.stage).toBe("ripe");

      for (let harvest = 1; harvest <= 3; harvest++) {
        command(CommandType.HARVEST, { type: "HARVEST", tileX: X, tileY: Y });
        expect(state.player.itemCounts[produce]).toBe(harvest);
        if (harvest < 3) {
          expect(plot()?.crop?.stage).toBe("full");
          use(ItemType.WATERING_CAN, X, Y);
          advance(regrowth);
          expect(plot()?.crop?.stage).toBe("ripe");
        }
      }
      expect(plot()?.crop?.stage).toBe("dead");
      command(CommandType.HARVEST, { type: "HARVEST", tileX: X, tileY: Y });
      expect(state.player.itemCounts[produce]).toBe(3);
      state.player.hp = 1;
      use(produce, X, Y);
      expect(state.player.hp).toBe(produce === ItemType.CORN ? 6 : 8);
      expect(state.player.itemCounts[produce]).toBe(2);
      use(ItemType.HOE, X, Y);
      expect(plot()?.crop).toBeUndefined();
    },
  );

  it("rejects sloped soil, spills no water on blocked or distant plots, and refills at the shore", () => {
    state.worldPlane.editCell(X, Y + 1, { elevation: 1 });
    use(ItemType.HOE, X, Y);
    expect(plot()).toBeUndefined();
    state.worldPlane.editCell(X, Y + 1, { elevation: 0 });
    use(ItemType.HOE, X, Y);
    setPositionFromGrid(state.player, X + 7, Y);
    use(ItemType.WATERING_CAN, X, Y);
    expect(plot()?.wetSeconds).toBe(0);
    setPositionFromGrid(state.player, X + 6, Y);
    state.worldPlane.editCell(X + 2, Y, { structure: StructureType.WALL });
    use(ItemType.WATERING_CAN, X, Y);
    expect(plot()?.wetSeconds).toBe(0);
    state.worldPlane.editCell(X + 2, Y, { structure: StructureType.NONE });
    use(ItemType.WATERING_CAN, X, Y);
    expect(plot()?.wetSeconds).toBe(WATER_DURATION);
    expect(state.player.wateringCanWater).toBe(WATERING_CAN_CAPACITY - 1);

    state.player.wateringCanWater = 0;
    expect(getWaterTarget(state, state.player, X, Y)).toBe("empty");
    state.worldPlane.editCell(X + 4, Y, { ground: GroundType.WATER_DEEP });
    use(ItemType.WATERING_CAN, X + 4, Y);
    command(CommandType.RELOAD, { type: "RELOAD" });
    expect(state.player.wateringCanWater).toBe(0);
    setPositionFromGrid(state.player, X + 5, Y);
    command(CommandType.RELOAD, { type: "RELOAD" });
    expect(state.player.wateringCanWater).toBe(WATERING_CAN_CAPACITY);
    state.player.wateringCanWater = 0;
    use(ItemType.WATERING_CAN, X + 4, Y);
    expect(state.player.wateringCanWater).toBe(WATERING_CAN_CAPACITY);
  });

  it("wilts dry crops and clears living plants with a pickaxe or manipulator", () => {
    use(ItemType.HOE, X, Y);
    use(ItemType.CORN_SEED, X, Y);
    advance(WILT_AFTER);
    expect(plot()?.crop?.stage).toBe("dead");
    use(ItemType.PICKAXE, X, Y);
    expect(plot()?.crop).toBeUndefined();
    use(ItemType.POTATO_SEED, X, Y);
    state.player.hasMatterManipulator = true;
    command(CommandType.MINE, { type: "MINE", tileX: X, tileY: Y });
    expect(plot()?.crop).toBeUndefined();
  });

  it("preserves sparse crop state across saves and deltas, including the fractional clock", () => {
    const initial = game.serialize();
    use(ItemType.HOE, X, Y);
    use(ItemType.POTATO_SEED, X, Y);
    use(ItemType.WATERING_CAN, X, Y);
    advance(2.5);

    const next = game.serialize();
    const delta = JSON.parse(
      JSON.stringify(computeStateDelta(initial, next, 2, 1)),
    );
    const rebuilt = applyStateDelta(initial, delta);
    expect(rebuilt.plane).toEqual(next.plane);

    const fresh = new Game();
    fresh.deserialize(JSON.parse(JSON.stringify(rebuilt)));
    const saved = fresh.getState();
    expect(saved.worldPlane.plots.get(saved.worldPlane.indexFor(X, Y))).toEqual(
      plot(),
    );
    expect(saved.worldPlane.farmSubsecondTicks).toBe(10);
    expect(saved.player.wateringCanWater).toBe(WATERING_CAN_CAPACITY - 1);

    const before = game.serialize();
    state.worldPlane.editCell(X, Y, { structure: StructureType.WALL });
    advance(1);
    const after = game.serialize();
    expect(
      applyStateDelta(before, computeStateDelta(before, after, 3, 2)).plane,
    ).toEqual(after.plane);
  });
});
