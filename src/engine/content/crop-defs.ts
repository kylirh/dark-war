/** Authored crop timings in active simulation seconds. */
import { CropKind, ItemType } from "../types";

export const WATERING_CAN_CAPACITY = 12;
export const WATERING_RANGE = 6;
export const WATER_DURATION = 20;
export const WILT_AFTER = 40;
export const HARVEST_LIMIT = 3;

interface CropDefinition {
  seed: ItemType;
  produce: ItemType;
  stageSeconds: number;
  regrowSeconds: number;
  seedChance: number;
  quality: "standard";
}

export const CROP_DEFS: Record<CropKind, CropDefinition> = {
  corn: {
    seed: ItemType.CORN_SEED,
    produce: ItemType.CORN,
    stageSeconds: 8,
    regrowSeconds: 14,
    seedChance: 0.6,
    quality: "standard",
  },
  potato: {
    seed: ItemType.POTATO_SEED,
    produce: ItemType.POTATO,
    stageSeconds: 6,
    regrowSeconds: 12,
    seedChance: 0.6,
    quality: "standard",
  },
};
