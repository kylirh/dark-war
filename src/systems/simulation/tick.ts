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
import { wrapDelta } from "../../utils/wrap";
import { ITEM_DEFS } from "../../content/item-defs";
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
  positiveAmount,
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
  // 3.6 Items within a magnetic radius drift to players and auto-collect
  processMagneticPickup(state);

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
          monster.hp = Math.min(
            hpMax,
            monster.hp + positiveAmount(item.heal, 20),
          );
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
// Magnetic Auto-Pickup
// ========================================

const MAGNET_RADIUS = 72; // items within this drift toward the player
const MAGNET_COLLECT_RADIUS = 20; // and are collected within this
const MAGNET_PULL_PX = 7; // per tick

/**
 * Pull loose items toward nearby players and auto-collect them. Machines (e.g.
 * vending machines) are excluded. Wrap-aware on the toroidal outside world.
 */
function processMagneticPickup(state: GameState): void {
  const players = getAlivePlayers(state);
  if (players.length === 0) return;
  const wraps = state.levelKind === "outside";
  const worldW = state.mapWidth * CELL_CONFIG.w;
  const worldH = state.mapHeight * CELL_CONFIG.h;

  const collected = new Set<string>();
  for (const item of state.entities) {
    if (item.kind !== EntityKind.ITEM) continue;
    const itm = item as Item;
    if (ITEM_DEFS[itm.type]?.category === "machine") continue;
    if (collected.has(itm.id)) continue;

    // Nearest player (wrapped distance on the torus).
    let best: Player | null = null;
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Infinity;
    for (const player of players) {
      const dx = wraps
        ? wrapDelta(itm.worldX, player.worldX, worldW)
        : player.worldX - itm.worldX;
      const dy = wraps
        ? wrapDelta(itm.worldY, player.worldY, worldH)
        : player.worldY - itm.worldY;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        bestDx = dx;
        bestDy = dy;
        best = player;
      }
    }
    if (!best || bestDist > MAGNET_RADIUS) continue;

    if (bestDist <= MAGNET_COLLECT_RADIUS) {
      pushEvent(state, {
        type: EventType.PICKUP_ITEM,
        data: { type: "PICKUP_ITEM", actorId: best.id, itemId: itm.id },
      });
      collected.add(itm.id);
      continue;
    }

    // Drift toward the player.
    const step = Math.min(MAGNET_PULL_PX, bestDist);
    itm.worldX += (bestDx / bestDist) * step;
    itm.worldY += (bestDy / bestDist) * step;
    if (wraps) {
      itm.worldX = ((itm.worldX % worldW) + worldW) % worldW;
      itm.worldY = ((itm.worldY % worldH) + worldH) % worldH;
    }
    itm.prevWorldX = itm.worldX;
    itm.prevWorldY = itm.worldY;
    item.physicsBody?.setPosition(itm.worldX, itm.worldY);
  }
}

// ========================================
// Hole Falls (Player + Monsters + Items)
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
      const playerTileIndex = idxFor(
        player.gridX,
        player.gridY,
        state.mapWidth,
      );
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
    const monsterTileIndex = idxFor(
      monster.gridX,
      monster.gridY,
      state.mapWidth,
    );

    if (holeCreated && holeCreatedTiles?.has(monsterTileIndex)) {
      triggerMonsterFall(state, monster);
      continue;
    }

    const tile = tileAtFor(
      state.map,
      monster.gridX,
      monster.gridY,
      state.mapWidth,
      state.mapHeight,
    );
    if (tile !== TileType.HOLE) continue;

    const movedOntoHole =
      Math.floor(monster.prevWorldX / CELL_CONFIG.w) !== monster.gridX ||
      Math.floor(monster.prevWorldY / CELL_CONFIG.h) !== monster.gridY;

    if (movedOntoHole && RNG.chance(0.5)) {
      triggerMonsterFall(state, monster);
    }
  }

  // Loose items resting on a hole fall through to the depths below.
  // (Depositing them onto the level below is a future refinement — for now they
  // drop out of reach; see docs/ROADMAP.md.)
  const fallenItemIds = new Set<string>();
  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.ITEM) continue;
    const tile = tileAtFor(
      state.map,
      entity.gridX,
      entity.gridY,
      state.mapWidth,
      state.mapHeight,
    );
    if (tile === TileType.HOLE) fallenItemIds.add(entity.id);
  }
  if (fallenItemIds.size > 0) {
    state.entityManager.destroyByIds(fallenItemIds);
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
