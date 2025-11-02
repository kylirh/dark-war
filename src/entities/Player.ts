import { Player, EntityKind, ItemType } from "../types";

/**
 * Create a new player entity
 */
export function createPlayer(x: number, y: number): Player {
  return {
    kind: EntityKind.PLAYER,
    x,
    y,
    ch: "@",
    color: "#e6edf3",
    hpMax: 20,
    hp: 20,
    sight: 9,
    weapon: ItemType.PISTOL,
    ammo: 12,
    ammoReserve: 24,
    keys: 0,
    score: 0,
  };
}
