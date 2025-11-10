import { Player, EntityKind, ItemType } from "../types";

/**
 * Create a new player entity
 */
export function createPlayer(x: number, y: number): Player {
  return {
    kind: EntityKind.PLAYER,
    x,
    y,
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
