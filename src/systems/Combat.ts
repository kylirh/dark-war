import {
  Player,
  Monster,
  Entity,
  EntityKind,
  TileType,
  ItemType,
  TILE_DEFINITIONS,
} from "../types";
import { entityAt, tileAt, setTile, removeEntity } from "../utils/helpers";
import { RNG } from "../utils/RNG";

/**
 * Result of a combat action
 */
export interface CombatResult {
  success: boolean;
  message: string;
  killed?: boolean;
  damage?: number;
}

/**
 * Attempt melee attack on adjacent tile
 */
export function meleeAttack(
  player: Player,
  entities: Entity[],
  targetX: number,
  targetY: number
): CombatResult {
  const target = entityAt(
    entities,
    targetX,
    targetY,
    (e) => e.kind === EntityKind.MONSTER
  );

  if (!target) {
    return { success: false, message: "" };
  }

  const monster = target as Monster;
  const damage = 1 + RNG.int(3);
  monster.hp -= damage;

  if (monster.hp <= 0) {
    player.score += 10;
    removeEntity(entities, monster);
    return {
      success: true,
      message: `You hit the mutant for ${damage}. Mutant defeated.`,
      killed: true,
      damage,
    };
  }

  return {
    success: true,
    message: `You hit the mutant for ${damage}.`,
    killed: false,
    damage,
  };
}

/**
 * Fire ranged weapon in direction
 */
export function fireWeapon(
  player: Player,
  entities: Entity[],
  map: TileType[],
  dx: number,
  dy: number
): CombatResult {
  if (player.weapon !== ItemType.PISTOL) {
    return { success: false, message: "You have nothing to fire." };
  }

  if (player.ammo <= 0) {
    return { success: false, message: "*Click*. No ammo. Press R to reload." };
  }

  player.ammo--;

  // Trace bullet path
  let x = player.x + dx;
  let y = player.y + dy;
  const maxRange = 12;

  for (let i = 0; i < maxRange; i++) {
    const tile = TILE_DEFINITIONS[tileAt(map, x, y)];

    // Hit wall or door
    if (tile.block || tile.opaque) {
      return { success: true, message: "Bang!" };
    }

    // Check for monster hit
    const target = entityAt(
      entities,
      x,
      y,
      (e) => e.kind === EntityKind.MONSTER
    );
    if (target) {
      const monster = target as Monster;
      const damage = 3 + RNG.int(5);
      monster.hp -= damage;

      if (monster.hp <= 0) {
        player.score += 15;
        removeEntity(entities, monster);
        return {
          success: true,
          message: `Bang! You shoot the mutant for ${damage}. Mutant drops.`,
          killed: true,
          damage,
        };
      }

      return {
        success: true,
        message: `Bang! You shoot the mutant for ${damage}.`,
        killed: false,
        damage,
      };
    }

    x += dx;
    y += dy;
  }

  return { success: true, message: "Bang!" };
}

/**
 * Reload weapon from reserve ammo
 */
export function reloadWeapon(player: Player): CombatResult {
  if (player.weapon !== ItemType.PISTOL) {
    return { success: false, message: "Nothing to reload." };
  }

  const magazineCapacity = 12;
  if (player.ammo === magazineCapacity) {
    return { success: false, message: "Magazine already full." };
  }

  const needed = magazineCapacity - player.ammo;
  const toReload = Math.min(needed, player.ammoReserve);

  if (toReload <= 0) {
    return { success: false, message: "No reserve ammo." };
  }

  player.ammo += toReload;
  player.ammoReserve -= toReload;

  return { success: true, message: `Reloaded ${toReload}.` };
}

/**
 * Monster attacks player
 */
export function monsterAttack(monster: Monster, player: Player): number {
  const damage = 1 + RNG.int(monster.dmg);
  player.hp -= damage;
  return damage;
}

/**
 * Open, close, or unlock door at position
 */
export function interactWithDoor(
  map: TileType[],
  player: Player,
  x: number,
  y: number
): CombatResult {
  const tile = tileAt(map, x, y);

  if (tile === TileType.DOOR_CLOSED) {
    setTile(map, x, y, TileType.DOOR_OPEN);
    return { success: true, message: "You open the door." };
  }

  if (tile === TileType.DOOR_OPEN) {
    setTile(map, x, y, TileType.DOOR_CLOSED);
    return { success: true, message: "You close the door." };
  }

  if (tile === TileType.DOOR_LOCKED) {
    if (player.keys > 0) {
      setTile(map, x, y, TileType.DOOR_CLOSED);
      player.keys--;
      return { success: true, message: "You unlock the door with a keycard." };
    } else {
      return { success: false, message: "Locked. You need a keycard." };
    }
  }

  return { success: false, message: "" };
}
