import { Monster, EntityKind } from "../types";

/**
 * Create a mutant enemy
 */
export function createMutant(x: number, y: number, depth: number): Monster {
  return {
    kind: EntityKind.MONSTER,
    x,
    y,
    ch: "M",
    color: "#ff9f9f",
    hp: 6 + depth,
    dmg: 2 + Math.floor(depth / 2),
  };
}
