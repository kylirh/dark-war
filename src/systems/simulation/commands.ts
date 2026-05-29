import {
  GameState,
  Command,
  CommandType,
  EventType,
  EntityKind,
  Monster,
  Player,
  TileType,
  ItemType,
  WeaponType,
  CELL_CONFIG,
} from "../../types";
import { passableFor, tileAtFor } from "../../utils/helpers";
import { applyWallDamageAt } from "../../utils/walls";
import { applyRepairAt } from "../../utils/repair";
import { canAddToInventory } from "../../utils/inventory";
import { RNG } from "../../utils/rng";
import { SoundEffect } from "../sound";
import { BulletEntity } from "../../entities/bullet-entity";
import { ExplosiveEntity } from "../../entities/explosive-entity";
import {
  SIM_DT_MS,
  GRENADE_FUSE_TICKS,
  EXPLOSIVE_OWNER_GRACE_TICKS,
  MELEE_KNOCKBACK_DISTANCE,
  SKULKER_SHOT_VARIANCE,
  SKULKER_BULLET_SPEED,
  SKULKER_SHOOT_MAX_RANGE_PX,
} from "./constants";
import {
  pushEvent,
  canActorAct,
  getActionCost,
  hasClearLineOfSight,
  directionFromAngle,
  normalizeAngle,
  findMeleeTarget,
  getClosestPlayer,
} from "./sim-helpers";

// ========================================
// Command Management
// ========================================

export function enqueueCommand(
  state: GameState,
  cmd: Omit<Command, "id">,
): void {
  const fullCmd: Command = { ...cmd, id: crypto.randomUUID() };

  if (!state.commandsByTick.has(fullCmd.tick)) {
    state.commandsByTick.set(fullCmd.tick, []);
  }

  const tickCommands = state.commandsByTick.get(fullCmd.tick)!;

  // In real-time, replace existing player command for this tick
  if (state.sim.mode === "REALTIME" && fullCmd.source === "PLAYER") {
    const existingIdx = tickCommands.findIndex(
      (c) => c.actorId === fullCmd.actorId,
    );
    if (existingIdx >= 0) {
      tickCommands[existingIdx] = fullCmd;
      return;
    }
  }

  tickCommands.push(fullCmd);
}

export function getCommandsForTick(state: GameState, tick: number): Command[] {
  return state.commandsByTick.get(tick) || [];
}

export function clearCommandsForTick(state: GameState, tick: number): void {
  state.commandsByTick.delete(tick);
}

/**
 * Clean up old commands that are in the past and will never execute
 */
export function cleanupOldCommands(state: GameState, currentTick: number): void {
  const keysToDelete: number[] = [];

  for (const tick of state.commandsByTick.keys()) {
    // Delete commands older than 50 ticks ago
    if (tick < currentTick - 50) {
      keysToDelete.push(tick);
    }
  }

  for (const tick of keysToDelete) {
    state.commandsByTick.delete(tick);
  }
}

// ========================================
// Command Resolution
// ========================================

export function resolveCommand(state: GameState, cmd: Command): void {
  // Ignore player commands if dead
  if (cmd.source === "PLAYER") {
    const player = state.entities.find(
      (e) => e.id === cmd.actorId && e.kind === EntityKind.PLAYER,
    ) as Player | undefined;
    if (player && player.hp <= 0) return;
  }

  let commandExecuted = true;

  switch (cmd.type) {
    case CommandType.MOVE:
      commandExecuted = resolveMoveCommand(state, cmd);
      break;
    case CommandType.MELEE:
      resolveMeleeCommand(state, cmd);
      break;
    case CommandType.FIRE:
      resolveFireCommand(state, cmd);
      break;
    case CommandType.RELOAD:
      resolveReloadCommand(state, cmd);
      break;
    case CommandType.PICKUP:
      resolvePickupCommand(state, cmd);
      break;
    case CommandType.INTERACT:
      resolveInteractCommand(state, cmd);
      break;
    case CommandType.DESCEND:
      resolveDescendCommand(state, cmd);
      break;
    case CommandType.ASCEND:
      resolveAscendCommand(state, cmd);
      break;
    case CommandType.REPAIR:
      resolveRepairCommand(state, cmd);
      break;
    case CommandType.WAIT:
      break;
  }

  // Set cooldown only if command was successfully executed
  if (commandExecuted) {
    const actor = state.entities.find((e) => e.id === cmd.actorId);
    if (actor) {
      actor.nextActTick = state.sim.nowTick + getActionCost(state, cmd, actor);
    }
  }
}

// ========================================
// Move Command
// ========================================

function resolveMoveCommand(state: GameState, cmd: Command): boolean {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor) return false;

  const data = cmd.data as { type: "MOVE"; dx: number; dy: number };
  const nx = actor.gridX + data.dx;
  const ny = actor.gridY + data.dy;

  // Check bounds
  if (nx < 0 || nx >= state.mapWidth || ny < 0 || ny >= state.mapHeight) {
    return false;
  }

  // Check passability
  if (!passableFor(state.map, nx, ny, state.mapWidth, state.mapHeight)) {
    return false;
  }

  // Check entity blocking - first try grid-based, then distance-based for continuous movement
  let blocker = state.entities.find(
    (e) =>
      e.gridX === nx &&
      e.gridY === ny &&
      (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER),
  );

  // Also check for monsters near the target position using continuous coordinates
  if (!blocker && actor.kind === EntityKind.PLAYER && "worldX" in actor) {
    const targetWorldX = nx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const targetWorldY = ny * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    const MELEE_RANGE_SQ = CELL_CONFIG.w * CELL_CONFIG.w; // One tile range, squared

    for (const entity of state.entities) {
      if (entity.kind !== EntityKind.MONSTER) continue;
      if (!("worldX" in entity)) continue;

      const dx = (entity as any).worldX - targetWorldX;
      const dy = (entity as any).worldY - targetWorldY;

      if (dx * dx + dy * dy < MELEE_RANGE_SQ) {
        blocker = entity;
        break;
      }
    }
  }

  if (blocker) {
    // If player trying to move into monster, convert to melee attack
    if (
      actor.kind === EntityKind.PLAYER &&
      blocker.kind === EntityKind.MONSTER
    ) {
      pushEvent(state, {
        type: EventType.DAMAGE,
        data: {
          type: "DAMAGE",
          targetId: blocker.id,
          amount: 1,
          sourceId: actor.id,
          knockbackX: (blocker as any).worldX - (actor as any).worldX,
          knockbackY: (blocker as any).worldY - (actor as any).worldY,
          knockbackDistance: MELEE_KNOCKBACK_DISTANCE,
        },
      });
      return true;
    }
    return false;
  }

  // Move succeeds - set velocity for smooth pixel-based movement
  if ("worldX" in actor) {
    const targetWorldX = nx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const targetWorldY = ny * CELL_CONFIG.h + CELL_CONFIG.h / 2;

    // Set target position
    (actor as any).targetWorldX = targetWorldX;
    (actor as any).targetWorldY = targetWorldY;

    // Calculate direction and set velocity
    const dx = targetWorldX - (actor as any).worldX;
    const dy = targetWorldY - (actor as any).worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      // Movement speed: 225 pixels per second for smooth motion
      const speed = 225;
      (actor as any).velocityX = (dx / dist) * speed;
      (actor as any).velocityY = (dy / dist) * speed;

      // Update facing angle
      (actor as any).facingAngle = Math.atan2(dy, dx);
    }
  }
  return true;
}

// ========================================
// Melee Command
// ========================================

function resolveMeleeCommand(state: GameState, cmd: Command): void {
  const attacker = state.entities.find((e) => e.id === cmd.actorId);
  if (!attacker) return;

  const data = cmd.data as { type: "MELEE"; targetId: string };
  const target = state.entities.find((e) => e.id === data.targetId);
  if (!target) return;

  // Check adjacency - support both grid-based and continuous coordinates
  let inRange = false;

  if ("worldX" in attacker && "worldX" in target) {
    // Use continuous distance check
    const dx = (attacker as any).worldX - (target as any).worldX;
    const dy = (attacker as any).worldY - (target as any).worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const MELEE_RANGE = CELL_CONFIG.w * 1.5; // 1.5 tiles
    inRange = distance <= MELEE_RANGE;
  } else {
    // Fall back to grid-based check
    const dx = Math.abs(attacker.gridX - target.gridX);
    const dy = Math.abs(attacker.gridY - target.gridY);
    inRange = dx <= 1 && dy <= 1;
  }

  if (!inRange) return;

  // Determine damage
  let damage = 1;
  if (attacker.kind === EntityKind.MONSTER) {
    damage = (attacker as Monster).dmg;
  }

  pushEvent(state, {
    type: EventType.DAMAGE,
    data: {
      type: "DAMAGE",
      targetId: target.id,
      amount: damage,
      sourceId: attacker.id,
      knockbackX: (target as any).worldX - (attacker as any).worldX,
      knockbackY: (target as any).worldY - (attacker as any).worldY,
      knockbackDistance: MELEE_KNOCKBACK_DISTANCE,
    },
  });
}

// ========================================
// Fire Command - Spawns bullet entities
// ========================================

function resolveFireCommand(state: GameState, cmd: Command): void {
  const shooter = state.entities.find((e) => e.id === cmd.actorId);
  if (!shooter) return;

  const data = cmd.data as {
    type: "FIRE";
    dx: number;
    dy: number;
    weapon?: WeaponType;
    targetWorldX?: number;
    targetWorldY?: number;
  };
  const weaponOverride = data.weapon;

  if (shooter.kind === EntityKind.PLAYER) {
    const player = shooter as Player;
    if (!("worldX" in player) || !("facingAngle" in player)) return;

    const angle = (player as any).facingAngle;
    const weapon = weaponOverride ?? player.weapon;

    switch (weapon) {
      case WeaponType.MELEE: {
        const target = findMeleeTarget(state, player, angle);
        if (!target) {
          const dx = Math.round(Math.cos(angle));
          const dy = Math.round(Math.sin(angle));
          const targetX = player.gridX + dx;
          const targetY = player.gridY + dy;
          const hitWall = applyWallDamageAt(state, targetX, targetY, 2);
          const targetTile = tileAtFor(state.map, targetX, targetY, state.mapWidth, state.mapHeight);
          const isPerimeterWall =
            targetTile === TileType.WALL &&
            (targetX <= 0 ||
              targetY <= 0 ||
              targetX >= state.mapWidth - 1 ||
              targetY >= state.mapHeight - 1);
          if (hitWall) {
            pushEvent(state, {
              type: EventType.MESSAGE,
              data: { type: "MESSAGE", message: "You chip the surface." },
            });
            return;
          }
          if (isPerimeterWall) {
            pushEvent(state, {
              type: EventType.MESSAGE,
              data: {
                type: "MESSAGE",
                message: "The wall seems impervious to damage.",
              },
            });
            return;
          }
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "You swing at empty air." },
          });
          return;
        }

        pushEvent(state, {
          type: EventType.DAMAGE,
          data: {
            type: "DAMAGE",
            targetId: target.id,
            amount: 2,
            sourceId: player.id,
            knockbackX: (target as any).worldX - (player as any).worldX,
            knockbackY: (target as any).worldY - (player as any).worldY,
            knockbackDistance: MELEE_KNOCKBACK_DISTANCE,
          },
        });
        return;
      }
      case WeaponType.PISTOL: {
        if (player.ammo <= 0) {
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "*click* Out of ammo!" },
          });
          return;
        }

        player.ammo--;
        state.pendingSounds.push({ effect: SoundEffect.SHOOT });

        const BULLET_SPEED = 600; // pixels per second
        const bullet = new BulletEntity(
          (player as any).worldX,
          (player as any).worldY,
          Math.cos(angle) * BULLET_SPEED,
          Math.sin(angle) * BULLET_SPEED,
          2,
          player.id,
          640,
        );

        state.entities.push(bullet);
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "Fired!" },
        });
        return;
      }
      case WeaponType.GRENADE: {
        if (player.grenades <= 0) {
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "No grenades left!" },
          });
          return;
        }

        player.grenades--;
        const THROW_SPEED = 360;
        const grenade = new ExplosiveEntity(
          (player as any).worldX,
          (player as any).worldY,
          ItemType.GRENADE,
          true,
          GRENADE_FUSE_TICKS,
          player.id,
          EXPLOSIVE_OWNER_GRACE_TICKS,
        );
        grenade.velocityX = Math.cos(angle) * THROW_SPEED;
        grenade.velocityY = Math.sin(angle) * THROW_SPEED;
        if (
          typeof data.targetWorldX === "number" &&
          typeof data.targetWorldY === "number"
        ) {
          const targetGridX = Math.max(
            0,
            Math.min(
              state.mapWidth - 1,
              Math.floor(data.targetWorldX / CELL_CONFIG.w),
            ),
          );
          const targetGridY = Math.max(
            0,
            Math.min(
              state.mapHeight - 1,
              Math.floor(data.targetWorldY / CELL_CONFIG.h),
            ),
          );
          grenade.targetWorldX =
            targetGridX * CELL_CONFIG.w + CELL_CONFIG.w / 2;
          grenade.targetWorldY =
            targetGridY * CELL_CONFIG.h + CELL_CONFIG.h / 2;
        }
        grenade.worldX += grenade.velocityX * (SIM_DT_MS / 1000);
        grenade.worldY += grenade.velocityY * (SIM_DT_MS / 1000);
        state.entities.push(grenade);
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "Grenade out!" },
        });
        return;
      }
      case WeaponType.LAND_MINE: {
        if (player.landMines <= 0) {
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "No land mines left!" },
          });
          return;
        }

        const [dx, dy] = directionFromAngle(angle);
        const targetX = player.gridX + dx;
        const targetY = player.gridY + dy;
        const canPlace = passableFor(
          state.map,
          targetX,
          targetY,
          state.mapWidth,
          state.mapHeight,
        );
        const placeX = canPlace ? targetX : player.gridX;
        const placeY = canPlace ? targetY : player.gridY;

        player.landMines--;
        const mine = new ExplosiveEntity(
          placeX * CELL_CONFIG.w + CELL_CONFIG.w / 2,
          placeY * CELL_CONFIG.h + CELL_CONFIG.h / 2,
          ItemType.LAND_MINE,
          true,
          undefined,
          player.id,
          EXPLOSIVE_OWNER_GRACE_TICKS,
        );
        state.entities.push(mine);
        pushEvent(state, {
          type: EventType.MESSAGE,
          data: { type: "MESSAGE", message: "Mine armed." },
        });
        return;
      }
      default:
        return;
    }
  }

  if (shooter.kind === EntityKind.MONSTER) {
    const monster = shooter as Monster;
    if (!("worldX" in monster) || !("worldY" in monster)) return;
    const target = getClosestPlayer(state, monster);
    if (!target) return;

    const dx = (target as any).worldX - (monster as any).worldX;
    const dy = (target as any).worldY - (monster as any).worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    const weapon = weaponOverride ?? WeaponType.GRENADE;

    switch (weapon) {
      case WeaponType.GRENADE: {
        if (monster.grenades <= 0) return;

        const THROW_SPEED = 320;
        const leadTime = distance / THROW_SPEED;
        const targetVelocityX = (target as any).velocityX ?? 0;
        const targetVelocityY = (target as any).velocityY ?? 0;
        const predictedX = (target as any).worldX + targetVelocityX * leadTime;
        const predictedY = (target as any).worldY + targetVelocityY * leadTime;
        const angle = Math.atan2(
          predictedY - (monster as any).worldY,
          predictedX - (monster as any).worldX,
        );

        monster.grenades--;
        const grenade = new ExplosiveEntity(
          (monster as any).worldX,
          (monster as any).worldY,
          ItemType.GRENADE,
          true,
          GRENADE_FUSE_TICKS,
          monster.id,
          EXPLOSIVE_OWNER_GRACE_TICKS,
        );
        grenade.velocityX = Math.cos(angle) * THROW_SPEED;
        grenade.velocityY = Math.sin(angle) * THROW_SPEED;
        grenade.worldX += grenade.velocityX * (SIM_DT_MS / 1000);
        grenade.worldY += grenade.velocityY * (SIM_DT_MS / 1000);
        state.entities.push(grenade);
        return;
      }
      case WeaponType.LAND_MINE: {
        if (monster.landMines <= 0) return;
        monster.landMines--;
        const mine = new ExplosiveEntity(
          (monster as any).worldX,
          (monster as any).worldY,
          ItemType.LAND_MINE,
          true,
          undefined,
          monster.id,
          EXPLOSIVE_OWNER_GRACE_TICKS,
        );
        state.entities.push(mine);
        return;
      }
      case WeaponType.PISTOL: {
        if (monster.bullets <= 0) return;

        const baseAngle = Math.atan2(dy, dx);
        const variance = ((RNG.int(100) - 50) / 50) * SKULKER_SHOT_VARIANCE;
        const angle = baseAngle + variance;

        monster.bullets--;
        const bullet = new BulletEntity(
          (monster as any).worldX,
          (monster as any).worldY,
          Math.cos(angle) * SKULKER_BULLET_SPEED,
          Math.sin(angle) * SKULKER_BULLET_SPEED,
          1,
          monster.id,
          SKULKER_SHOOT_MAX_RANGE_PX,
        );
        state.entities.push(bullet);
        state.pendingSounds.push({
          effect: SoundEffect.SHOOT,
          worldX: (monster as any).worldX,
          worldY: (monster as any).worldY,
        });
        return;
      }
      default:
        return;
    }
  }
}

// ========================================
// Reload Command
// ========================================

function resolveReloadCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  if (player.ammoReserve === 0) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "You're out of ammo!" },
    });
    return;
  }

  const needed = 12 - player.ammo;
  const take = Math.min(needed, player.ammoReserve);
  player.ammo += take;
  player.ammoReserve -= take;

  // Play reload sound
  state.pendingSounds.push({ effect: SoundEffect.RELOAD });

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: '"RELOAD!!"' },
  });
}

// ========================================
// Pickup Command
// ========================================

function resolvePickupCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  // Find items within pickup radius (24px for continuous movement)
  const PICKUP_RADIUS = 24;
  const itemsNearby = state.entities.filter((e) => {
    if (e.kind !== EntityKind.ITEM) return false;

    // Use continuous coordinates if available
    if ("worldX" in actor && "worldX" in e) {
      const dx = (e as any).worldX - (actor as any).worldX;
      const dy = (e as any).worldY - (actor as any).worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= PICKUP_RADIUS;
    }

    // Fallback to grid coordinates
    return e.gridX === actor.gridX && e.gridY === actor.gridY;
  });

  const player = actor as Player;
  let anyPickedUp = false;

  for (const item of itemsNearby) {
    const worldItem = item as { type: ItemType };
    // Medkits and powercells bypass the full-inventory check (auto-consumed)
    const bypassCheck =
      worldItem.type === ItemType.MEDKIT ||
      worldItem.type === ItemType.POWERCELL;

    if (!bypassCheck && !canAddToInventory(player, worldItem.type)) {
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "Inventory full!" },
      });
      continue;
    }

    pushEvent(state, {
      type: EventType.PICKUP_ITEM,
      data: { type: "PICKUP_ITEM", actorId: actor.id, itemId: item.id },
    });
    anyPickedUp = true;
  }

  if (!anyPickedUp && itemsNearby.length === 0) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "Nothing to pick up!" },
    });
  }
}

// ========================================
// Interact Command (Open Doors)
// ========================================

function resolveInteractCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor) return;

  const data = cmd.data as { type: "INTERACT"; x: number; y: number };
  const tile = tileAtFor(state.map, data.x, data.y, state.mapWidth, state.mapHeight);

  if (tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_OPEN) {
    // Toggle door open/closed
    pushEvent(state, {
      type: EventType.DOOR_OPEN,
      data: { type: "DOOR_OPEN", x: data.x, y: data.y },
    });
  } else if (tile === TileType.DOOR_LOCKED) {
    if (actor.kind === EntityKind.PLAYER && (actor as Player).keys > 0) {
      (actor as Player).keys--;
      pushEvent(state, {
        type: EventType.DOOR_OPEN,
        data: { type: "DOOR_OPEN", x: data.x, y: data.y },
      });
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You unlock the door." },
      });
    } else {
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "The door is locked." },
      });
    }
  }
}

// ========================================
// Repair Command (Utility Bot)
// ========================================

function resolveRepairCommand(state: GameState, cmd: Command): void {
  const data = cmd.data as { type: "REPAIR"; x: number; y: number };
  const result = applyRepairAt(state, data.x, data.y);
  if (!result) return;

  // 1 in 5 chance to play repair sound (avoid spamming)
  if (RNG.chance(0.2)) {
    const worldX = data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
    const worldY = data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
    state.pendingSounds.push({
      effect: result === "hole" ? SoundEffect.REPAIR_HOLE : SoundEffect.REPAIR,
      worldX,
      worldY,
    });
  }

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: {
      type: "MESSAGE",
      message:
        result === "hole"
          ? "Utility bot patches the hole."
          : "Utility bot repairs the damage.",
    },
  });
}

// ========================================
// Descend Command
// ========================================

function resolveDescendCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  if (
    player.gridX !== state.stairsDown[0] ||
    player.gridY !== state.stairsDown[1]
  ) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "No stairs here." },
    });
    return;
  }

  // Trigger level change (handled by Game.ts after tick completes)
  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: "You descend deeper..." },
  });

  // Set flag for Game.ts to handle
  state.descendTarget = undefined;
  state.shouldDescend = true;
}

// ========================================
// Ascend Command
// ========================================

function resolveAscendCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  if (
    !state.stairsUp ||
    player.gridX !== state.stairsUp[0] ||
    player.gridY !== state.stairsUp[1]
  ) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "No stairs here." },
    });
    return;
  }

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: "You ascend..." },
  });

  state.shouldAscend = true;
}
