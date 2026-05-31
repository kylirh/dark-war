import {
  GameState,
  EntityKind,
  Monster,
  MonsterType,
  Player,
  Item,
  ItemType,
  TileType,
  CELL_CONFIG,
  HOLE_FALL_DAMAGE,
  EventType,
} from "../../types";
import { idxFor, tileAtFor } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import {
  MONSTER_AI_UPDATE_INTERVAL,
  MAX_COMMANDS_PER_TICK,
  FLEE_HP_RATIO,
  MONSTER_ITEM_PICKUP_CHANCE,
  SKULKER_MAX_BULLETS,
} from "./constants";
import {
  getAlivePlayers,
  canActorAct,
  pushEvent,
} from "./sim-helpers";
import { updateMonsterSteering, generateAICommands } from "./ai";
import { updateExplosives, updateEffects } from "./explosives";
import { processEventQueue } from "./events";
import {
  getCommandsForTick,
  clearCommandsForTick,
  cleanupOldCommands,
  resolveCommand,
} from "./commands";

function positiveAmount(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  return fallback;
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

  // 4.5 Handle hole falling checks (player + monsters)
  processHoleFalls(state);
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
  const monsters: Monster[] = [];
  const items: Item[] = [];
  for (const e of state.entities) {
    if (e.kind === EntityKind.MONSTER && (e as Monster).hp > 0) {
      monsters.push(e as Monster);
    } else if (e.kind === EntityKind.ITEM) {
      items.push(e as Item);
    }
  }
  if (monsters.length === 0 || items.length === 0) return;

  const PICKUP_RADIUS = 24;
  const MEDKIT_PICKUP_RADIUS = 48; // Desperate monsters grab medkits from further away
  const pickedItemIds = new Set<string>();

  for (const monster of monsters) {
    if (!monster.carriedItems) {
      monster.carriedItems = [];
    }
    const hpMax = monster.hpMax ?? monster.hp;
    const isFleeing = monster.hp <= hpMax * FLEE_HP_RATIO;

    for (const item of items) {
      if (pickedItemIds.has(item.id)) continue;

      let isOverlapping = false;
      const radius =
        item.type === ItemType.MEDKIT ? MEDKIT_PICKUP_RADIUS : PICKUP_RADIUS;

      if ("worldX" in monster && "worldX" in item) {
        const dx = item.worldX - monster.worldX;
        const dy = item.worldY - monster.worldY;
        isOverlapping = dx * dx + dy * dy <= radius * radius;
      } else {
        isOverlapping =
          item.gridX === monster.gridX && item.gridY === monster.gridY;
      }

      if (!isOverlapping) continue;

      if (!RNG.chance(MONSTER_ITEM_PICKUP_CHANCE)) continue;

      switch (item.type) {
        case ItemType.MEDKIT:
          if (!isFleeing) continue;
          monster.hp = Math.min(hpMax, monster.hp + positiveAmount(item.heal, 20));
          break;
        case ItemType.GRENADE:
          monster.grenades += positiveAmount(item.amount, 1);
          break;
        case ItemType.LAND_MINE:
          monster.landMines += positiveAmount(item.amount, 1);
          break;
        case ItemType.AMMO:
          if (monster.type === MonsterType.SKULKER) {
            // Skulkers reload directly from ammo pickups
            monster.bullets = Math.min(
              SKULKER_MAX_BULLETS,
              monster.bullets + positiveAmount(item.amount, 8),
            );
          } else {
            monster.carriedItems.push({
              type: ItemType.AMMO,
              amount: positiveAmount(item.amount, 8),
            });
          }
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
        case ItemType.CTDM:
          monster.carriedItems.push({ type: ItemType.CTDM });
          break;
        case ItemType.POWERCELL:
          monster.carriedItems.push({
            type: ItemType.POWERCELL,
            amount: positiveAmount(item.amount, 25),
          });
          break;
      }

      pickedItemIds.add(item.id);
    }
  }

  if (pickedItemIds.size > 0) {
    state.entityManager.destroyByIds(pickedItemIds);
  }
}

// ========================================
// Hole Falls (Player + Monsters)
// ========================================

function processHoleFalls(state: GameState): void {
  if (state.shouldDescend) {
    if (state.holeCreatedTiles && state.holeCreatedTiles.size > 0) {
      state.holeCreatedTiles.clear();
    }
    return;
  }

  const holeCreatedTiles = state.holeCreatedTiles;
  const holeCreated = holeCreatedTiles && holeCreatedTiles.size > 0;

  // In online play the multiplayer server owns player hole-falls (it migrates
  // the individual player between per-depth worlds), so skip them here to avoid
  // warping the whole party and double-applying fall damage. Monsters still fall.
  const online = state.multiplayer?.mode === "online";

  const players = getAlivePlayers(state);
  if (holeCreated && !online) {
    for (const player of players) {
      const playerTileIndex = idxFor(player.gridX, player.gridY, state.mapWidth);
      if (holeCreatedTiles?.has(playerTileIndex)) {
        triggerPlayerFall(state, player);
        break;
      }
    }
  }

  const monsters = state.entities.filter(
    (e): e is Monster => e.kind === EntityKind.MONSTER && e.hp > 0,
  );

  for (const monster of monsters) {
    const monsterTileIndex = idxFor(monster.gridX, monster.gridY, state.mapWidth);

    if (holeCreated && holeCreatedTiles?.has(monsterTileIndex)) {
      triggerMonsterFall(state, monster);
      continue;
    }

    const tile = tileAtFor(state.map, monster.gridX, monster.gridY, state.mapWidth, state.mapHeight);
    if (tile !== TileType.HOLE) continue;

    const movedOntoHole =
      Math.floor(monster.prevWorldX / CELL_CONFIG.w) !== monster.gridX ||
      Math.floor(monster.prevWorldY / CELL_CONFIG.h) !== monster.gridY;

    if (movedOntoHole && RNG.chance(0.5)) {
      triggerMonsterFall(state, monster);
    }
  }

  if (holeCreatedTiles && holeCreatedTiles.size > 0) {
    holeCreatedTiles.clear();
  }
}

function triggerPlayerFall(state: GameState, player: Player): void {
  state.descendTarget = [player.gridX, player.gridY];
  state.shouldDescend = true;

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: "You fall through the floor!" },
  });

  pushEvent(state, {
    type: EventType.DAMAGE,
    data: {
      type: "DAMAGE",
      targetId: player.id,
      amount: HOLE_FALL_DAMAGE,
    },
  });
}

function triggerMonsterFall(state: GameState, monster: Monster): void {
  pushEvent(state, {
    type: EventType.MESSAGE,
    data: {
      type: "MESSAGE",
      message: `The ${monster.type} falls through the floor!`,
    },
  });

  pushEvent(state, {
    type: EventType.DAMAGE,
    data: {
      type: "DAMAGE",
      targetId: monster.id,
      amount: HOLE_FALL_DAMAGE,
    },
  });

  state.entityManager.destroy(monster.id);
}
