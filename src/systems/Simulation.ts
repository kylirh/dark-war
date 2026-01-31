import {
  GameState,
  Command,
  CommandType,
  GameEvent,
  EventType,
  EntityKind,
  Monster,
  Player,
  Entity,
  TileType,
  ItemType,
  Item,
  WeaponType,
  Explosive,
  TILE_DEFINITIONS,
  CELL_CONFIG,
  MAP_HEIGHT,
  MAP_WIDTH,
} from "../types";
import { idx, tileAt, passable } from "../utils/helpers";
import { applyWallDamageAt } from "../utils/walls";
import { Sound, SoundEffect } from "./Sound";
import { RNG } from "../utils/RNG";
import { computeFOVFrom } from "./FOV";
import { BulletEntity } from "../entities/BulletEntity";
import { ExplosiveEntity } from "../entities/ExplosiveEntity";
import { ItemEntity } from "../entities/ItemEntity";

// ========================================
// Constants
// ========================================

export const SIM_DT_MS = 50; // 20 ticks/second
export const MONSTER_ACTION_DELAY = 5; // Monsters act every N ticks (player acts every 1)
export const MONSTER_AI_UPDATE_INTERVAL = 5; // Update monster velocities every 5 ticks (~4 Hz)
export const MONSTER_SPEED = 225; // pixels per second
export const MONSTER_ARRIVAL_RADIUS = CELL_CONFIG.w * 1.5; // Stop when within 1.5 tiles for attack
export const MONSTER_ITEM_PICKUP_CHANCE = 0.85; // 85% chance to pick up items when overlapping
export const MAX_EVENTS_PER_TICK = 1000;
export const MAX_COMMANDS_PER_TICK = 1000;
const GRENADE_FUSE_TICKS = 14; // ~0.7s at 20 ticks/sec
const EXPLOSIVE_OWNER_GRACE_TICKS = 6;
const MELEE_ARC = Math.PI / 3;

const EXPLOSIVE_CONFIG: Record<
  ItemType.GRENADE | ItemType.LAND_MINE,
  { radius: number; damage: number }
> = {
  [ItemType.GRENADE]: { radius: 2.5, damage: 6 },
  [ItemType.LAND_MINE]: { radius: 2, damage: 8 },
};

// ========================================
// Steering Behaviors (Continuous Movement AI)
// ========================================

/**
 * Update monster velocities using steering behaviors
 * Called every MONSTER_AI_UPDATE_INTERVAL ticks
 */
export function updateMonsterSteering(state: GameState): void {
  const monsters = state.entities.filter(
    (e): e is Monster => e.kind === EntityKind.MONSTER,
  );
  const player = state.player;

  for (const monster of monsters) {
    // Skip if monster doesn't have continuous coordinates
    if (!("worldX" in monster) || !("worldY" in monster)) continue;

    const monsterEntity = monster as any;
    const playerEntity = player as any;

    // Calculate distance to player
    const dx = playerEntity.worldX - monsterEntity.worldX;
    const dy = playerEntity.worldY - monsterEntity.worldY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Check if player is visible
    const monsterVision = computeFOVFrom(
      state.map,
      monster.gridX,
      monster.gridY,
      15,
    );
    const playerIndex = idx(player.gridX, player.gridY);
    const canSeePlayer = monsterVision.has(playerIndex);

    if (!canSeePlayer) {
      // Can't see player - stop or wander
      if (RNG.chance(0.1)) {
        // 10% chance to wander in random direction
        const angle = RNG.int(8) * (Math.PI / 4); // 8 directions
        monsterEntity.velocityX = Math.cos(angle) * MONSTER_SPEED * 0.5;
        monsterEntity.velocityY = Math.sin(angle) * MONSTER_SPEED * 0.5;
      } else {
        // Stop moving
        monsterEntity.velocityX = 0;
        monsterEntity.velocityY = 0;
      }
      continue;
    }

    // Player is visible
    if (pixelDistance <= MONSTER_ARRIVAL_RADIUS) {
      // Within attack range - stop and attack
      monsterEntity.velocityX = 0;
      monsterEntity.velocityY = 0;
      // Note: Actual attack will be handled by command system
    } else {
      // Chase player - move toward them
      const dirX = dx / pixelDistance; // Normalize
      const dirY = dy / pixelDistance;
      monsterEntity.velocityX = dirX * MONSTER_SPEED;
      monsterEntity.velocityY = dirY * MONSTER_SPEED;
    }
  }
}

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
function cleanupOldCommands(state: GameState, currentTick: number): void {
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

  if (keysToDelete.length > 0) {
    console.log(`Cleaned up ${keysToDelete.length} old command ticks`);
  }
}

// ========================================
// Event Management
// ========================================

export function pushEvent(
  state: GameState,
  event: Omit<GameEvent, "id" | "depth">,
): void {
  const depth = event.cause ? getEventDepth(state, event.cause) + 1 : 0;
  state.eventQueue.push({ ...event, id: crypto.randomUUID(), depth });
}

function getEventDepth(state: GameState, causeId: string): number {
  const causeEvent = state.eventQueue.find((e) => e.id === causeId);
  return causeEvent ? causeEvent.depth : 0;
}

// ========================================
// Main Simulation Tick
// ========================================

export function stepSimulationTick(state: GameState): void {
  const tick = state.sim.nowTick;

  // 0. Update monster steering behaviors every N ticks
  if (tick % MONSTER_AI_UPDATE_INTERVAL === 0) {
    updateMonsterSteering(state);
  }

  updateExplosives(state);
  updateEffects(state);

  // 1. Gather and resolve player commands first
  let playerCommands = getCommandsForTick(state, tick);

  // Sort player commands deterministically
  playerCommands.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.actorId !== b.actorId) return a.actorId.localeCompare(b.actorId);
    return a.id.localeCompare(b.id);
  });

  // Resolve player commands
  for (const cmd of playerCommands) {
    if (!canActorAct(state, cmd.actorId, tick)) continue;
    resolveCommand(state, cmd);
  }

  // 2. Generate AI commands based on UPDATED state (after player moved)
  const aiCommands = generateAICommands(state, tick);

  // Guard against too many AI commands
  if (aiCommands.length > MAX_COMMANDS_PER_TICK) {
    console.error(
      `Too many AI commands for tick ${tick}: ${aiCommands.length}`,
    );
    aiCommands.length = MAX_COMMANDS_PER_TICK;
  }

  // Sort AI commands deterministically
  aiCommands.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.actorId !== b.actorId) return a.actorId.localeCompare(b.actorId);
    return a.id.localeCompare(b.id);
  });

  // 3. Resolve AI commands
  for (const cmd of aiCommands) {
    if (!canActorAct(state, cmd.actorId, tick)) continue;
    resolveCommand(state, cmd);
  }

  // 3.5 Monsters can pick up items when overlapping them
  processMonsterItemPickups(state);

  // 4. Process event queue until empty
  processEventQueue(state);

  // 5. Cleanup and increment
  clearCommandsForTick(state, tick);

  // 6. Periodically clean up old unexecuted commands to prevent memory leak
  if (tick % 100 === 0) {
    cleanupOldCommands(state, tick);
  }

  state.sim.nowTick++;
}

// ========================================
// Monster Item Pickup (Auto)
// ========================================

function processMonsterItemPickups(state: GameState): void {
  const monsters = state.entities.filter(
    (e): e is Monster => e.kind === EntityKind.MONSTER && e.hp > 0,
  );
  if (monsters.length === 0) return;

  const items = state.entities.filter(
    (e): e is Item => e.kind === EntityKind.ITEM,
  );
  if (items.length === 0) return;

  const PICKUP_RADIUS = 24;
  const pickedItemIds = new Set<string>();

  for (const monster of monsters) {
    if (!monster.carriedItems) {
      monster.carriedItems = [];
    }
    for (const item of items) {
      if (pickedItemIds.has(item.id)) continue;

      let isOverlapping = false;

      if ("worldX" in monster && "worldX" in item) {
        const dx = (item as any).worldX - (monster as any).worldX;
        const dy = (item as any).worldY - (monster as any).worldY;
        isOverlapping = Math.sqrt(dx * dx + dy * dy) <= PICKUP_RADIUS;
      } else {
        isOverlapping =
          item.gridX === monster.gridX && item.gridY === monster.gridY;
      }

      if (!isOverlapping) continue;

      if (!RNG.chance(MONSTER_ITEM_PICKUP_CHANCE)) continue;

      switch (item.type) {
        case ItemType.MEDKIT:
          continue;
        case ItemType.GRENADE:
          monster.grenades += item.amount || 1;
          break;
        case ItemType.LAND_MINE:
          monster.landMines += item.amount || 1;
          break;
        case ItemType.AMMO:
          monster.carriedItems.push({
            type: ItemType.AMMO,
            amount: item.amount,
          });
          break;
        case ItemType.KEYCARD:
          monster.carriedItems.push({
            type: ItemType.KEYCARD,
          });
          break;
        case ItemType.PISTOL:
          monster.carriedItems.push({
            type: ItemType.PISTOL,
          });
          break;
      }

      pickedItemIds.add(item.id);
    }
  }

  if (pickedItemIds.size > 0) {
    state.entities = state.entities.filter((e) => !pickedItemIds.has(e.id));
  }
}

// ========================================
// Actor Readiness
// ========================================

function canActorAct(state: GameState, actorId: string, tick: number): boolean {
  const entity = state.entities.find((e) => e.id === actorId);
  if (!entity) return false;

  // Dead check
  if (entity.kind === EntityKind.PLAYER) {
    if ((entity as Player).hp <= 0) return false;
  }
  if (entity.kind === EntityKind.MONSTER) {
    if ((entity as Monster).hp <= 0) return false;
  }

  const nextAct = entity.nextActTick ?? 0;
  return tick >= nextAct;
}

// ========================================
// Command Resolution
// ========================================

function resolveCommand(state: GameState, cmd: Command): void {
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

function getActionCost(state: GameState, cmd: Command, actor: Entity): number {
  // In planning mode, everyone acts at same rate (turn-based)
  if (state.sim.mode === "PLANNING") {
    return 1;
  }

  // In real-time mode, monsters act slower to give player reaction time at high tick rates
  if (actor.kind === EntityKind.MONSTER) {
    return MONSTER_ACTION_DELAY;
  }

  // Player acts every tick for responsive controls
  return 1;
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
  if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= 36) return false;

  // Check passability
  if (!passable(state.map, nx, ny)) return false;

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
    const MELEE_RANGE = CELL_CONFIG.w; // One tile range

    for (const entity of state.entities) {
      if (entity.kind !== EntityKind.MONSTER) continue;
      if (!("worldX" in entity)) continue;

      const dx = (entity as any).worldX - targetWorldX;
      const dy = (entity as any).worldY - targetWorldY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < MELEE_RANGE) {
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

function directionFromAngle(angle: number): [number, number] {
  const directions: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const index = Math.round(angle / (Math.PI / 4));
  return directions[(index + directions.length) % directions.length];
}

function normalizeAngle(angle: number): number {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function hasClearLineOfSight(
  map: TileType[],
  startWorldX: number,
  startWorldY: number,
  endWorldX: number,
  endWorldY: number,
): boolean {
  const gridX1 = Math.floor(startWorldX / CELL_CONFIG.w);
  const gridY1 = Math.floor(startWorldY / CELL_CONFIG.h);
  const gridX2 = Math.floor(endWorldX / CELL_CONFIG.w);
  const gridY2 = Math.floor(endWorldY / CELL_CONFIG.h);

  const dx = Math.abs(gridX2 - gridX1);
  const dy = Math.abs(gridY2 - gridY1);
  const sx = gridX1 < gridX2 ? 1 : -1;
  const sy = gridY1 < gridY2 ? 1 : -1;
  let err = dx - dy;

  let x = gridX1;
  let y = gridY1;

  while (true) {
    const tile = tileAt(map, x, y);
    if (
      tile === TileType.WALL ||
      tile === TileType.DOOR_CLOSED ||
      tile === TileType.DOOR_LOCKED
    ) {
      if ((x !== gridX1 || y !== gridY1) && (x !== gridX2 || y !== gridY2)) {
        return false;
      }
    }

    if (x === gridX2 && y === gridY2) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return true;
}

function findMeleeTarget(
  state: GameState,
  player: Player,
  facingAngle: number,
): Monster | null {
  const monsters = state.entities.filter(
    (e): e is Monster => e.kind === EntityKind.MONSTER,
  );
  let best: Monster | null = null;
  let bestDistance = Infinity;

  for (const monster of monsters) {
    const dx = (monster as any).worldX - (player as any).worldX;
    const dy = (monster as any).worldY - (player as any).worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > CELL_CONFIG.w * 1.5) continue;

    const angleTo = Math.atan2(dy, dx);
    const delta = Math.abs(normalizeAngle(angleTo - facingAngle));
    if (delta > MELEE_ARC / 2) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = monster;
    }
  }

  return best;
}

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
          const targetTile = tileAt(state.map, targetX, targetY);
          const isPerimeterWall =
            targetTile === TileType.WALL &&
            (targetX <= 0 ||
              targetY <= 0 ||
              targetX >= MAP_WIDTH - 1 ||
              targetY >= MAP_HEIGHT - 1);
          if (hitWall) {
            pushEvent(state, {
              type: EventType.MESSAGE,
              data: { type: "MESSAGE", message: "You chip the wall." },
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
        Sound.play(SoundEffect.SHOOT);

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
        const canPlace = passable(state.map, targetX, targetY);
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
    const target = state.player;

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
  Sound.play(SoundEffect.RELOAD);

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

  if (itemsNearby.length === 0) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "Nothing to pick up!" },
    });
    return;
  }

  for (const item of itemsNearby) {
    pushEvent(state, {
      type: EventType.PICKUP_ITEM,
      data: { type: "PICKUP_ITEM", actorId: actor.id, itemId: item.id },
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
  const tile = tileAt(state.map, data.x, data.y);

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
// Descend Command
// ========================================

function resolveDescendCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  if (player.gridX !== state.stairs[0] || player.gridY !== state.stairs[1]) {
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
  state.shouldDescend = true;
}

// ========================================
// Explosives and Effects
// ========================================

function triggerExplosion(
  state: GameState,
  worldX: number,
  worldY: number,
  type: ItemType.GRENADE | ItemType.LAND_MINE,
  cause?: string,
): void {
  const gridX = Math.floor(worldX / CELL_CONFIG.w);
  const gridY = Math.floor(worldY / CELL_CONFIG.h);
  const config = EXPLOSIVE_CONFIG[type];

  pushEvent(state, {
    type: EventType.EXPLOSION,
    data: {
      type: "EXPLOSION",
      x: gridX,
      y: gridY,
      radius: config.radius,
      damage: config.damage,
    },
    cause,
  });
}

function updateExplosives(state: GameState): void {
  const explosives = state.entities.filter(
    (e): e is ExplosiveEntity =>
      e.kind === EntityKind.EXPLOSIVE && e instanceof ExplosiveEntity,
  );

  const actors = state.entities.filter(
    (e) => e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER,
  );

  for (const explosive of explosives) {
    if (!explosive.armed) continue;

    if (
      explosive.type === ItemType.GRENADE &&
      explosive.fuseTicks !== undefined
    ) {
      explosive.fuseTicks -= 1;
      if (explosive.fuseTicks <= 0) {
        triggerExplosion(
          state,
          explosive.worldX,
          explosive.worldY,
          explosive.type,
        );
        state.entities = state.entities.filter((e) => e.id !== explosive.id);
        continue;
      }
    }

    if (explosive.type === ItemType.LAND_MINE) {
      const triggerRadius = CELL_CONFIG.w * 0.45;
      const triggered = actors.some((actor) => {
        if (
          explosive.ownerId &&
          explosive.ignoreOwnerTicks &&
          explosive.ignoreOwnerTicks > 0 &&
          actor.id === explosive.ownerId
        ) {
          return false;
        }
        const dx = (actor as any).worldX - explosive.worldX;
        const dy = (actor as any).worldY - explosive.worldY;
        return Math.sqrt(dx * dx + dy * dy) <= triggerRadius;
      });

      if (triggered) {
        triggerExplosion(
          state,
          explosive.worldX,
          explosive.worldY,
          explosive.type,
        );
        state.entities = state.entities.filter((e) => e.id !== explosive.id);
      }
    }
  }
}

function updateEffects(state: GameState): void {
  state.effects = state.effects
    .map((effect) => ({ ...effect, ageTicks: effect.ageTicks + 1 }))
    .filter((effect) => effect.ageTicks < effect.durationTicks);
}

// ========================================
// Event Processing
// ========================================

export function processEventQueue(state: GameState): void {
  let processed = 0;

  while (state.eventQueue.length > 0) {
    if (processed++ > MAX_EVENTS_PER_TICK) {
      console.error("Event cascade exceeded max events per tick");
      break;
    }

    const event = state.eventQueue.shift()!;
    processEvent(state, event);
  }
}

function processEvent(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case EventType.DAMAGE:
      processDamageEvent(state, event);
      break;
    case EventType.DEATH:
      processDeathEvent(state, event);
      break;
    case EventType.EXPLOSION:
      processExplosionEvent(state, event);
      break;
    case EventType.MESSAGE:
      processMessageEvent(state, event);
      break;
    case EventType.DOOR_OPEN:
      processDoorOpenEvent(state, event);
      break;
    case EventType.PICKUP_ITEM:
      processPickupItemEvent(state, event);
      break;
    case EventType.PLAYER_DEATH:
      processPlayerDeathEvent(state, event);
      break;
    case EventType.NPC_TALK:
      processNPCTalkEvent(state, event);
      break;
  }
}

function processDamageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "DAMAGE";
    targetId: string;
    amount: number;
    sourceId?: string;
    fromExplosion?: boolean;
    suppressHitSound?: boolean;
  };
  const target = state.entities.find((e) => e.id === data.targetId);
  if (!target) return;

  if (target.kind === EntityKind.PLAYER) {
    const player = target as Player;

    // Don't damage or play sounds if already dead
    if (player.hp <= 0) return;

    player.hp -= data.amount;

    // Don't let HP go below 0
    if (player.hp < 0) player.hp = 0;

    // Play hit sound
    Sound.playPlayerHit();

    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `You take ${data.amount} damage!` },
      cause: event.id,
    });

    if (player.hp <= 0) {
      pushEvent(state, {
        type: EventType.PLAYER_DEATH,
        data: { type: "PLAYER_DEATH", playerId: player.id },
        cause: event.id,
      });
    }
  } else if (target.kind === EntityKind.MONSTER) {
    const monster = target as Monster;
    monster.hp -= data.amount;

    if (!data.suppressHitSound) {
      // Play monster hit sound
      Sound.play(SoundEffect.HIT_MONSTER);
    }

    if (monster.hp <= 0) {
      pushEvent(state, {
        type: EventType.DEATH,
        data: {
          type: "DEATH",
          entityId: monster.id,
          fromExplosion: data.fromExplosion,
        },
        cause: event.id,
      });
    }
  }
}

function processExplosionEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "EXPLOSION";
    x: number;
    y: number;
    radius: number;
    damage: number;
  };

  const worldX = data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
  const worldY = data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
  const radiusPx = data.radius * CELL_CONFIG.w;

  Sound.play(SoundEffect.EXPLOSION);
  state.effects.push({
    id: crypto.randomUUID(),
    type: "explosion",
    worldX,
    worldY,
    ageTicks: 0,
    durationTicks: 6,
  });

  const explosivesToTrigger: Explosive[] = [];
  const itemsToTrigger: Item[] = [];

  for (const entity of state.entities) {
    const dx = (entity as any).worldX - worldX;
    const dy = (entity as any).worldY - worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > radiusPx) continue;

    if (
      entity.kind === EntityKind.MONSTER ||
      entity.kind === EntityKind.PLAYER
    ) {
      pushEvent(state, {
        type: EventType.DAMAGE,
        data: {
          type: "DAMAGE",
          targetId: entity.id,
          amount: data.damage,
          fromExplosion: true,
        },
        cause: event.id,
      });
    } else if (entity.kind === EntityKind.EXPLOSIVE) {
      explosivesToTrigger.push(entity as Explosive);
    } else if (
      entity.kind === EntityKind.ITEM &&
      (entity as Item).type &&
      ((entity as Item).type === ItemType.GRENADE ||
        (entity as Item).type === ItemType.LAND_MINE)
    ) {
      itemsToTrigger.push(entity as Item);
    }
  }

  const minX = Math.max(0, Math.floor(data.x - data.radius) - 1);
  const maxX = Math.min(MAP_WIDTH - 1, Math.ceil(data.x + data.radius) + 1);
  const minY = Math.max(0, Math.floor(data.y - data.radius) - 1);
  const maxY = Math.min(MAP_HEIGHT - 1, Math.ceil(data.y + data.radius) + 1);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tileCenterX = x * CELL_CONFIG.w + CELL_CONFIG.w / 2;
      const tileCenterY = y * CELL_CONFIG.h + CELL_CONFIG.h / 2;
      const dx = tileCenterX - worldX;
      const dy = tileCenterY - worldY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusPx * radiusPx) continue;
      applyWallDamageAt(state, x, y, data.damage);
    }
  }

  for (const explosive of explosivesToTrigger) {
    triggerExplosion(
      state,
      (explosive as any).worldX,
      (explosive as any).worldY,
      explosive.type,
      event.id,
    );
    state.entities = state.entities.filter((e) => e.id !== explosive.id);
  }

  for (const item of itemsToTrigger) {
    triggerExplosion(
      state,
      (item as any).worldX,
      (item as any).worldY,
      item.type as ItemType.GRENADE | ItemType.LAND_MINE,
      event.id,
    );
    state.entities = state.entities.filter((e) => e.id !== item.id);
  }
}

function processDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "DEATH";
    entityId: string;
    fromExplosion?: boolean;
  };
  const entity = state.entities.find((e) => e.id === data.entityId);
  if (!entity) return;

  if (entity.kind === EntityKind.MONSTER) {
    const monster = entity as Monster;
    if (!monster.carriedItems) {
      monster.carriedItems = [];
    }

    // Play death sound
    Sound.play(SoundEffect.MONSTER_DEATH);

    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `The ${monster.type} dies.` },
      cause: event.id,
    });

    state.player.score += 10;

    if (monster.grenades > 0 || monster.landMines > 0) {
      const spawnExplosive = (
        type: ItemType.GRENADE | ItemType.LAND_MINE,
        count: number,
      ) => {
        for (let i = 0; i < count; i++) {
          if (data.fromExplosion) {
            triggerExplosion(
              state,
              (monster as any).worldX,
              (monster as any).worldY,
              type,
              event.cause,
            );
          } else {
            state.entities.push(
              new ItemEntity(monster.gridX, monster.gridY, type),
            );
          }
        }
      };

      spawnExplosive(ItemType.GRENADE, monster.grenades);
      spawnExplosive(ItemType.LAND_MINE, monster.landMines);
    }

    if (monster.carriedItems.length > 0) {
      for (const carried of monster.carriedItems) {
        const item = new ItemEntity(monster.gridX, monster.gridY, carried.type);
        if (typeof carried.amount === "number") {
          item.amount = carried.amount;
        }
        if (typeof carried.heal === "number") {
          item.heal = carried.heal;
        }
        state.entities.push(item);
      }
    }

    // Remove from entity list
    state.entities = state.entities.filter((e) => e.id !== entity.id);
  }
}

function processMessageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "MESSAGE"; message: string };
  state.log.unshift(data.message);
  if (state.log.length > 200) {
    state.log.pop();
  }
}

function processDoorOpenEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "DOOR_OPEN"; x: number; y: number };
  const i = idx(data.x, data.y);
  const tile = state.map[i];

  if (tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_LOCKED) {
    // Open the door
    state.map[i] = TileType.DOOR_OPEN;
    Sound.play(SoundEffect.DOOR_OPEN);
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  } else if (tile === TileType.DOOR_OPEN) {
    // Close the door
    state.map[i] = TileType.DOOR_CLOSED;
    Sound.play(SoundEffect.DOOR_CLOSE);
    // Track tile change for physics update
    if (!state.changedTiles) state.changedTiles = new Set();
    state.changedTiles.add(i);
  }
}

function processPickupItemEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "PICKUP_ITEM";
    actorId: string;
    itemId: string;
  };
  const actor = state.entities.find((e) => e.id === data.actorId);
  const item = state.entities.find((e) => e.id === data.itemId) as
    | Item
    | undefined;

  if (!actor || !item || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;

  switch (item.type) {
    case ItemType.MEDKIT:
      player.hp = Math.min(player.hpMax, player.hp + (item.heal || 20));
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You use the medkit. +20 HP" },
        cause: event.id,
      });
      break;
    case ItemType.AMMO:
      player.ammoReserve += item.amount || 24;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: {
          type: "MESSAGE",
          message: `You pick up ${item.amount || 24} rounds.`,
        },
        cause: event.id,
      });
      break;
    case ItemType.KEYCARD:
      player.keys++;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a keycard." },
        cause: event.id,
      });
      break;
    case ItemType.PISTOL:
      player.weapon = WeaponType.PISTOL;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a pistol." },
        cause: event.id,
      });
      break;
    case ItemType.GRENADE:
      player.grenades += item.amount || 1;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a grenade." },
        cause: event.id,
      });
      break;
    case ItemType.LAND_MINE:
      player.landMines += item.amount || 1;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a land mine." },
        cause: event.id,
      });
      break;
  }

  // Remove item
  state.entities = state.entities.filter((e) => e.id !== item.id);
}

function processPlayerDeathEvent(state: GameState, event: GameEvent): void {
  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: "You have died." },
    cause: event.id,
  });

  // Note: Death handling (stopping movement, showing overlay, time adjustment)
  // is done in Game.updateDeathStatus() which is called after each simulation tick
}

function processNPCTalkEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "NPC_TALK";
    npcId: string;
    message: string;
  };

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: data.message },
    cause: event.id,
  });

  // Slow down time on NPC talk
  state.sim.targetTimeScale = 0.01;
  state.sim.pauseReasons.add("npc_talk");
}

// ========================================
// AI Command Generation
// ========================================

function generateAICommands(state: GameState, tick: number): Command[] {
  const commands: Command[] = [];

  const monsters = state.entities.filter(
    (e) => e.kind === EntityKind.MONSTER && canActorAct(state, e.id, tick),
  ) as Monster[];

  for (const monster of monsters) {
    const cmd = decideMonsterCommand(state, monster, tick);
    if (cmd) commands.push(cmd);
  }

  return commands;
}

function decideMonsterCommand(
  state: GameState,
  monster: Monster,
  tick: number,
): Command | null {
  const { player } = state;

  // Calculate distance - prefer continuous if available
  let distance: number;
  let inMeleeRange = false;

  if ("worldX" in monster && "worldX" in player) {
    const dx = (player as any).worldX - (monster as any).worldX;
    const dy = (player as any).worldY - (monster as any).worldY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    distance = pixelDistance / CELL_CONFIG.w; // Convert to tile units for FOV check
    const MELEE_RANGE = CELL_CONFIG.w * 1.5; // 1.5 tiles for melee
    inMeleeRange = pixelDistance <= MELEE_RANGE;
  } else {
    const dx = player.gridX - monster.gridX;
    const dy = player.gridY - monster.gridY;
    distance = Math.max(Math.abs(dx), Math.abs(dy));
    inMeleeRange = distance === 1;
  }

  // Adjacent: melee attack
  if (inMeleeRange) {
    return {
      id: crypto.randomUUID(),
      tick,
      actorId: monster.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: player.id },
      priority: 0,
      source: "AI",
    };
  }

  // Throw grenade if available, clear line-of-sight, and enough space
  const monsterWorldX = (monster as any).worldX;
  const monsterWorldY = (monster as any).worldY;
  const playerWorldX = (player as any).worldX;
  const playerWorldY = (player as any).worldY;
  const hasGrenadeLOS = hasClearLineOfSight(
    state.map,
    monsterWorldX,
    monsterWorldY,
    playerWorldX,
    playerWorldY,
  );

  if (
    monster.grenades > 0 &&
    distance <= 8 &&
    distance >= 2 &&
    hasGrenadeLOS &&
    RNG.chance(0.35)
  ) {
    return {
      id: crypto.randomUUID(),
      tick,
      actorId: monster.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 0, dy: 0, weapon: WeaponType.GRENADE },
      priority: 1,
      source: "AI",
    };
  }

  // Lay land mine if available and close to player
  if (monster.landMines > 0 && distance <= 3 && RNG.chance(0.25)) {
    return {
      id: crypto.randomUUID(),
      tick,
      actorId: monster.id,
      type: CommandType.FIRE,
      data: { type: "FIRE", dx: 0, dy: 0, weapon: WeaponType.LAND_MINE },
      priority: 1,
      source: "AI",
    };
  }

  // Check field of view and distance (only chase if player is visible and within 15 tiles)
  // Use same FOV algorithm as player for consistent vision
  // Slightly longer range than player (9 tiles) to make them more threatening
  const monsterVision = computeFOVFrom(
    state.map,
    monster.gridX,
    monster.gridY,
    15,
  );
  const playerIndex = idx(player.gridX, player.gridY);
  const canSeePlayer = monsterVision.has(playerIndex);

  if (!canSeePlayer) {
    // Idle wander or wait
    if (RNG.chance(0.2)) {
      const dirs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ];
      const [moveX, moveY] = RNG.choose(dirs);
      const nx = monster.gridX + moveX;
      const ny = monster.gridY + moveY;

      if (passable(state.map, nx, ny)) {
        const blocker = state.entities.find(
          (e) =>
            e.gridX === nx &&
            e.gridY === ny &&
            (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER),
        );

        if (!blocker) {
          return {
            id: crypto.randomUUID(),
            tick,
            actorId: monster.id,
            type: CommandType.MOVE,
            data: { type: "MOVE", dx: moveX, dy: moveY },
            priority: 0,
            source: "AI",
          };
        }
      }
    }

    // Wait if can't wander
    return {
      id: crypto.randomUUID(),
      tick,
      actorId: monster.id,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "AI",
    };
  }

  // Chase player (greedy step with fallback directions)
  // Always use grid-based dx/dy for movement direction
  const dx = player.gridX - monster.gridX;
  const dy = player.gridY - monster.gridY;
  const moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const moveY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  // Try preferred direction first
  const tryMove = (testX: number, testY: number): boolean => {
    const nx = monster.gridX + testX;
    const ny = monster.gridY + testY;

    if (!passable(state.map, nx, ny)) return false;

    const blocker = state.entities.find(
      (e) =>
        e.gridX === nx &&
        e.gridY === ny &&
        (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER),
    );

    if (blocker) return false;

    // Move is valid
    return true;
  };

  // Build list of directions to try, prioritized by distance to player
  const directions: [number, number, number][] = []; // [dx, dy, distance_score]

  // All 8 directions
  const allDirs: [number, number][] = [
    [moveX, moveY], // Primary direction (diagonal)
    [moveX, 0], // Horizontal component
    [0, moveY], // Vertical component
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  // Score each direction by how much it reduces distance to player
  for (const [testX, testY] of allDirs) {
    if (testX === 0 && testY === 0) continue;

    const newX = monster.gridX + testX;
    const newY = monster.gridY + testY;
    const newDist =
      Math.abs(player.gridX - newX) + Math.abs(player.gridY - newY);
    const currentDist = Math.abs(dx) + Math.abs(dy);
    const score = currentDist - newDist; // Higher score = closer to player

    directions.push([testX, testY, score]);
  }

  // Sort by score (best first), then deduplicate
  directions.sort((a, b) => b[2] - a[2]);

  // Remove duplicate directions
  const seen = new Set<string>();
  const uniqueDirections: [number, number][] = [];
  for (const [testX, testY] of directions) {
    const key = `${testX},${testY}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDirections.push([testX, testY]);
    }
  }

  // Try each direction in priority order
  for (const [testX, testY] of uniqueDirections) {
    if (tryMove(testX, testY)) {
      return {
        id: crypto.randomUUID(),
        tick,
        actorId: monster.id,
        type: CommandType.MOVE,
        data: { type: "MOVE", dx: testX, dy: testY },
        priority: 0,
        source: "AI",
      };
    }
  }

  // Wait if can't move anywhere
  return {
    id: crypto.randomUUID(),
    tick,
    actorId: monster.id,
    type: CommandType.WAIT,
    data: { type: "WAIT" },
    priority: 0,
    source: "AI",
  };
}
