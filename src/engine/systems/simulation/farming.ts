/** Shared farming rules used by the simulation and the targeting UI. */
import {
  CROP_DEFS,
  HARVEST_LIMIT,
  WATER_DURATION,
  WATERING_CAN_CAPACITY,
  WATERING_RANGE,
  WILT_AFTER,
} from "../../content/crop-defs";
import { itemName } from "../../content/item-defs";
import { SoundEffect } from "../../content/sound-effects";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../../core/world-semantics";
import {
  CELL_CONFIG,
  CropKind,
  FarmPlot,
  GameState,
  ItemType,
  Player,
} from "../../types";
import { SIM_DT_MS } from "./constants";
import { bresenhamLine } from "../../utils/bresenham";
import { addToInventory, consumeItem } from "../../utils/inventory";
import { RNG } from "../../utils/rng";
import { wrapDelta, wrapValue } from "../../utils/wrap";

const GROWTH_STAGES = [
  "seed",
  "seedling",
  "small",
  "medium",
  "full",
  "ripe",
] as const;
const NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

type WaterTarget = "pour" | "refill" | "empty" | "blocked";

function cellIndex(state: GameState, x: number, y: number): number {
  const plane = state.worldPlane;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return -1;
  if (state.levelKind === "outside") {
    x = wrapValue(x, plane.width);
    y = wrapValue(y, plane.height);
  }
  return plane.inBounds(x, y) ? plane.indexFor(x, y) : -1;
}

function distanceTo(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): [number, number] {
  const dx = x - player.gridX;
  const dy = y - player.gridY;
  return state.levelKind === "outside"
    ? [wrapDelta(0, dx, state.mapWidth), wrapDelta(0, dy, state.mapHeight)]
    : [dx, dy];
}

function isWater(state: GameState, index: number): boolean {
  const ground = state.worldPlane.layers.ground[index];
  return (
    ground === GroundType.WATER_SHALLOW ||
    ground === GroundType.WATER_DEEP ||
    ground === GroundType.WATER_RIVER
  );
}

function canCultivate(state: GameState, index: number): boolean {
  const { layers, width } = state.worldPlane;
  const ground = layers.ground[index];
  if (
    ground !== GroundType.GRASS &&
    ground !== GroundType.DIRT &&
    ground !== GroundType.WEEDS
  )
    return false;
  if (
    layers.structure[index] !== StructureType.NONE ||
    (layers.fixture[index] !== FixtureType.NONE &&
      layers.fixture[index] !== FixtureType.GARDEN)
  )
    return false;
  const x = index % width;
  const y = Math.floor(index / width);
  return NEIGHBORS.every(
    ([dx, dy]) =>
      layers.elevation[cellIndex(state, x + dx, y + dy)] ===
      layers.elevation[index],
  );
}

function hasPourPath(
  state: GameState,
  player: Player,
  dx: number,
  dy: number,
): boolean {
  const plane = state.worldPlane;
  const elevation =
    plane.layers.elevation[cellIndex(state, player.gridX, player.gridY)];
  return bresenhamLine(0, 0, dx, dy, (px, py) => {
    const index = cellIndex(state, player.gridX + px, player.gridY + py);
    return (
      index >= 0 &&
      plane.layers.elevation[index] === elevation &&
      !plane.opaque(index % plane.width, Math.floor(index / plane.width))
    );
  });
}

export function getWaterTarget(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): WaterTarget {
  const index = cellIndex(state, x, y);
  if (index < 0) return "blocked";
  const [dx, dy] = distanceTo(state, player, x, y);
  if (isWater(state, index))
    return Math.abs(dx) + Math.abs(dy) === 1 ? "refill" : "blocked";
  if (
    dx * dx + dy * dy > WATERING_RANGE ** 2 ||
    !state.worldPlane.plots.has(index) ||
    !canCultivate(state, index) ||
    state.worldPlane.plots.get(index)?.crop?.stage === "dead" ||
    !hasPourPath(state, player, dx, dy)
  )
    return "blocked";
  return player.wateringCanWater === 0 ? "empty" : "pour";
}

function farmAlert(state: GameState, player: Player, message: string): void {
  state.pendingAlerts.push({ message, audiencePlayerIds: [player.id] });
}

export function refillWateringCan(state: GameState, player: Player): void {
  if (
    !NEIGHBORS.some(([dx, dy]) =>
      isWater(state, cellIndex(state, player.gridX + dx, player.gridY + dy)),
    )
  ) {
    farmAlert(state, player, "Stand next to water to refill the can.");
    return;
  }
  player.wateringCanWater = WATERING_CAN_CAPACITY;
  state.pendingSounds.push({ effect: SoundEffect.RELOAD });
  farmAlert(state, player, "Watering can refilled.");
}

export function inCropReach(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): boolean {
  const [dx, dy] = distanceTo(state, player, x, y);
  return (
    Math.max(Math.abs(dx), Math.abs(dy)) <= 1 &&
    hasPourPath(state, player, dx, dy)
  );
}

export function clearCropWithPickaxe(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): boolean {
  return (
    Boolean(state.worldPlane?.plots.size) &&
    inCropReach(state, player, x, y) &&
    removeCrop(state, x, y)
  );
}

export function removeCrop(state: GameState, x: number, y: number): boolean {
  if (!state.worldPlane?.plots.size) return false;
  const plot = state.worldPlane.plots.get(cellIndex(state, x, y));
  if (!plot?.crop) return false;
  delete plot.crop;
  state.pendingSounds.push({ effect: SoundEffect.REPAIR });
  return true;
}

export function useFarmItem(
  state: GameState,
  player: Player,
  item: ItemType,
  x: number,
  y: number,
): void {
  const index = cellIndex(state, x, y);
  const plots = state.worldPlane.plots;
  const plot = plots.get(index);
  if (item === ItemType.WATERING_CAN) {
    const target = getWaterTarget(state, player, x, y);
    if (target === "refill") return refillWateringCan(state, player);
    if (target !== "pour" || !plot) {
      farmAlert(
        state,
        player,
        target === "empty"
          ? "Watering can empty. Refill at the shore."
          : isWater(state, index)
            ? "Stand next to that water to refill."
            : "Aim at a reachable tilled plot within six tiles.",
      );
      return;
    }
    player.wateringCanWater =
      (player.wateringCanWater ?? WATERING_CAN_CAPACITY) - 1;
    plot.wetSeconds = WATER_DURATION;
    if (plot.crop) plot.crop.drySeconds = 0;
    state.pendingSounds.push({ effect: SoundEffect.SPLASH });
    state.effects.push({
      id: `water:${player.id}:${state.sim.nowTick}:${state.effects.length}`,
      type: "water_splash",
      entityId: player.id,
      worldX: ((index % state.mapWidth) + 0.5) * CELL_CONFIG.w,
      worldY: (Math.floor(index / state.mapWidth) + 0.5) * CELL_CONFIG.h,
      ageTicks: 0,
      durationTicks: 8,
    });
    return;
  }

  const [dx, dy] = distanceTo(state, player, x, y);
  if (
    Math.max(Math.abs(dx), Math.abs(dy)) > 1 ||
    !hasPourPath(state, player, dx, dy)
  ) {
    farmAlert(state, player, "That plot is out of reach.");
    return;
  }
  if (item === ItemType.HOE) {
    if (removeCrop(state, x, y)) return;
    if (!canCultivate(state, index)) {
      farmAlert(state, player, "Till clear, level grass or soil.");
      return;
    }
    if (!plot) {
      plots.set(index, { wetSeconds: 0 });
      state.pendingSounds.push({ effect: SoundEffect.REPAIR });
    }
    return;
  }
  if (!plot || plot.crop || !canCultivate(state, index)) {
    farmAlert(state, player, "Plant seeds in an empty tilled plot.");
    return;
  }
  if (!(player.itemCounts[item] ?? 0)) return;
  const kind: CropKind = item === ItemType.CORN_SEED ? "corn" : "potato";
  plot.crop = {
    kind,
    stage: "seed",
    growthSeconds: 0,
    drySeconds: 0,
    harvests: 0,
  };
  consumeItem(player, item);
  state.pendingSounds.push({ effect: SoundEffect.CLICK });
}

export function harvestCrop(
  state: GameState,
  player: Player,
  x: number,
  y: number,
): void {
  const index = cellIndex(state, x, y);
  const crop = state.worldPlane.plots.get(index)?.crop;
  if (!crop || !canCultivate(state, index) || !inCropReach(state, player, x, y))
    return;
  if (crop.stage !== "ripe") {
    farmAlert(
      state,
      player,
      crop.stage === "dead"
        ? "Clear the dead crop with a tool."
        : "This crop is still growing.",
    );
    return;
  }
  const def = CROP_DEFS[crop.kind];
  if (!addToInventory(player, def.produce)) {
    farmAlert(state, player, "Make room in your inventory before harvesting.");
    return;
  }
  player.itemCounts[def.produce] = (player.itemCounts[def.produce] ?? 0) + 1;
  const foundSeed =
    RNG.chance(def.seedChance) && addToInventory(player, def.seed);
  if (foundSeed)
    player.itemCounts[def.seed] = (player.itemCounts[def.seed] ?? 0) + 1;
  crop.harvests++;
  crop.stage = crop.harvests === HARVEST_LIMIT ? "dead" : "full";
  crop.growthSeconds = 0;
  crop.drySeconds = 0;
  state.pendingSounds.push({ effect: SoundEffect.CLICK });
  farmAlert(
    state,
    player,
    `Harvested ${itemName(def.produce)}${foundSeed ? " and saved a seed" : ""}.`,
  );
}

/** Advance only when the owning plane takes a simulation tick. */
export function tickFarming(state: GameState): void {
  const plane = state.worldPlane;
  if (!plane?.plots.size) return;
  if (++plane.farmSubsecondTicks < 1000 / SIM_DT_MS) return;
  plane.farmSubsecondTicks = 0;
  for (const [index, plot] of state.worldPlane.plots) {
    if (!canCultivate(state, index)) {
      state.worldPlane.plots.delete(index);
      continue;
    }
    advancePlot(plot);
  }
}

function advancePlot(plot: FarmPlot): void {
  const watered = plot.wetSeconds > 0;
  if (watered) plot.wetSeconds--;
  const crop = plot.crop;
  if (!crop || crop.stage === "ripe" || crop.stage === "dead") return;
  if (!watered) {
    if (++crop.drySeconds >= WILT_AFTER) crop.stage = "dead";
    return;
  }
  crop.drySeconds = 0;
  const def = CROP_DEFS[crop.kind];
  const duration = crop.harvests > 0 ? def.regrowSeconds : def.stageSeconds;
  if (++crop.growthSeconds < duration) return;
  crop.growthSeconds = 0;
  crop.stage = GROWTH_STAGES[GROWTH_STAGES.indexOf(crop.stage) + 1];
}
