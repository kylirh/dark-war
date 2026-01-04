import {
  GameState,
  Command,
  CommandType,
  GameEvent,
  EventType,
  EntityKind,
  Monster,
  Player,
  TileType,
  ItemType,
  Item,
  TILE_DEFINITIONS,
} from "../types";
import { idx, tileAt, passable } from "../utils/helpers";
import { MAP_WIDTH } from "../types";
import { Sound, SoundEffect } from "./Sound";
import { RNG } from "../utils/RNG";
import { computeFOVFrom } from "./FOV";

// ========================================
// Constants
// ========================================

export const SIM_DT_MS = 200; // 5 ticks/second
export const MAX_EVENTS_PER_TICK = 1000;
export const MAX_COMMANDS_PER_TICK = 1000;

let nextCommandId = 1;
let nextEventId = 1;

// ========================================
// Command Management
// ========================================

export function enqueueCommand(
  state: GameState,
  cmd: Omit<Command, "id">
): void {
  const fullCmd: Command = { ...cmd, id: nextCommandId++ };

  if (!state.commandsByTick.has(fullCmd.tick)) {
    state.commandsByTick.set(fullCmd.tick, []);
  }

  const tickCommands = state.commandsByTick.get(fullCmd.tick)!;

  // In real-time, replace existing player command for this tick
  if (state.sim.mode === "REALTIME" && fullCmd.source === "PLAYER") {
    const existingIdx = tickCommands.findIndex(
      (c) => c.actorId === fullCmd.actorId
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
  event: Omit<GameEvent, "id" | "depth">
): void {
  const depth = event.cause ? getEventDepth(state, event.cause) + 1 : 0;
  state.eventQueue.push({ ...event, id: nextEventId++, depth });
}

function getEventDepth(state: GameState, causeId: number): number {
  const causeEvent = state.eventQueue.find((e) => e.id === causeId);
  return causeEvent ? causeEvent.depth : 0;
}

// ========================================
// Main Simulation Tick
// ========================================

export function stepSimulationTick(state: GameState): void {
  const tick = state.sim.nowTick;

  // 1. Gather and resolve player commands first
  let playerCommands = getCommandsForTick(state, tick);

  // Sort player commands deterministically
  playerCommands.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.actorId !== b.actorId) return a.actorId - b.actorId;
    return a.id - b.id;
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
      `Too many AI commands for tick ${tick}: ${aiCommands.length}`
    );
    aiCommands.length = MAX_COMMANDS_PER_TICK;
  }

  // Sort AI commands deterministically
  aiCommands.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.actorId !== b.actorId) return a.actorId - b.actorId;
    return a.id - b.id;
  });

  // 3. Resolve AI commands
  for (const cmd of aiCommands) {
    if (!canActorAct(state, cmd.actorId, tick)) continue;
    resolveCommand(state, cmd);
  }

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
// Actor Readiness
// ========================================

function canActorAct(state: GameState, actorId: number, tick: number): boolean {
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
      (e) => e.id === cmd.actorId && e.kind === EntityKind.PLAYER
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
      actor.nextActTick = state.sim.nowTick + getActionCost(cmd);
    }
  }
}

function getActionCost(cmd: Command): number {
  // Future: different actions could cost different amounts
  return 1;
}

// ========================================
// Move Command
// ========================================

function resolveMoveCommand(state: GameState, cmd: Command): boolean {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor) return false;

  const data = cmd.data as { type: "MOVE"; dx: number; dy: number };
  const nx = actor.x + data.dx;
  const ny = actor.y + data.dy;

  // Check bounds
  if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= 36) return false;

  // Check passability
  if (!passable(state.map, nx, ny)) return false;

  // Check entity blocking
  const blocker = state.entities.find(
    (e) =>
      e.x === nx &&
      e.y === ny &&
      (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER)
  );

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

  // Move succeeds
  actor.x = nx;
  actor.y = ny;
  return true;
}

// ========================================
// Melee Command
// ========================================

function resolveMeleeCommand(state: GameState, cmd: Command): void {
  const attacker = state.entities.find((e) => e.id === cmd.actorId);
  if (!attacker) return;

  const data = cmd.data as { type: "MELEE"; targetId: number };
  const target = state.entities.find((e) => e.id === data.targetId);
  if (!target) return;

  // Check adjacency
  const dx = Math.abs(attacker.x - target.x);
  const dy = Math.abs(attacker.y - target.y);
  if (dx > 1 || dy > 1) return;

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
// Fire Command
// ========================================

function resolveFireCommand(state: GameState, cmd: Command): void {
  const shooter = state.entities.find((e) => e.id === cmd.actorId);
  if (!shooter || shooter.kind !== EntityKind.PLAYER) return;

  const player = shooter as Player;
  if (player.ammo <= 0) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "*click* Out of ammo!" },
    });
    return;
  }

  player.ammo--;

  // Play gunshot sound
  Sound.play(SoundEffect.SHOOT);

  const data = cmd.data as { type: "FIRE"; dx: number; dy: number };

  // Trace bullet path along the direction until hitting monster or wall
  let currentX = player.x;
  let currentY = player.y;
  let target: Monster | undefined;
  const maxRange = 20; // Maximum bullet range

  for (let i = 0; i < maxRange; i++) {
    currentX += data.dx;
    currentY += data.dy;

    // Check bounds
    if (
      currentX < 0 ||
      currentX >= MAP_WIDTH ||
      currentY < 0 ||
      currentY >= 36
    ) {
      break;
    }

    // Check for wall or obstacle
    const tile = tileAt(state.map, currentX, currentY);
    if (
      !passable(state.map, currentX, currentY) ||
      tile === TileType.DOOR_CLOSED ||
      tile === TileType.DOOR_LOCKED
    ) {
      break;
    }

    // Check for monster at this position
    const foundMonster = state.entities.find(
      (e) =>
        e.x === currentX &&
        e.y === currentY &&
        e.kind === EntityKind.MONSTER &&
        (e as Monster).hp > 0
    ) as Monster | undefined;

    if (foundMonster) {
      target = foundMonster;
      break;
    }
  }

  if (target) {
    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: target.id,
        amount: 2,
        sourceId: player.id,
      },
    });
  } else {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "You miss." },
    });
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
      data: { type: "MESSAGE", message: "No ammo to reload!" },
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
    data: { type: "MESSAGE", message: "Reload." },
  });
}

// ========================================
// Pickup Command
// ========================================

function resolvePickupCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const itemsHere = state.entities.filter(
    (e) => e.kind === EntityKind.ITEM && e.x === actor.x && e.y === actor.y
  );

  if (itemsHere.length === 0) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "Nothing to pick up here." },
    });
    return;
  }

  for (const item of itemsHere) {
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
  if (player.x !== state.stairs[0] || player.y !== state.stairs[1]) {
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
  (state as any)._shouldDescend = true;
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
    targetId: number;
    amount: number;
    sourceId?: number;
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

    // Play monster hit sound
    Sound.play(SoundEffect.HIT_MONSTER);

    if (monster.hp <= 0) {
      pushEvent(state, {
        type: EventType.DEATH,
        data: { type: "DEATH", entityId: monster.id },
        cause: event.id,
      });
    }
  }
}

function processDeathEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "DEATH"; entityId: number };
  const entity = state.entities.find((e) => e.id === data.entityId);
  if (!entity) return;

  if (entity.kind === EntityKind.MONSTER) {
    const monster = entity as Monster;

    // Play death sound
    Sound.play(SoundEffect.MONSTER_DEATH);

    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `The ${monster.type} dies.` },
      cause: event.id,
    });

    state.player.score += 10;

    // Remove from entity list
    state.entities = state.entities.filter((e) => e.id !== entity.id);
  }
}

function processMessageEvent(state: GameState, event: GameEvent): void {
  const data = event.data as { type: "MESSAGE"; message: string };
  state.log.push(data.message);
  if (state.log.length > 100) {
    state.log.shift();
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
  } else if (tile === TileType.DOOR_OPEN) {
    // Close the door
    state.map[i] = TileType.DOOR_CLOSED;
    Sound.play(SoundEffect.DOOR_CLOSE);
  }
}

function processPickupItemEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "PICKUP_ITEM";
    actorId: number;
    itemId: number;
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
      player.weapon = ItemType.PISTOL;
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You pick up a pistol." },
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

  // Switch to real-time mode to show monsters continuing
  if (state.sim.mode === "PLANNING") {
    state.sim.mode = "REALTIME";
  }
}

function processNPCTalkEvent(state: GameState, event: GameEvent): void {
  const data = event.data as {
    type: "NPC_TALK";
    npcId: number;
    message: string;
  };

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message: data.message },
    cause: event.id,
  });

  // Pause on NPC talk
  state.sim.isPaused = true;
  state.sim.pauseReasons.add("npc_talk");
}

// ========================================
// AI Command Generation
// ========================================

function generateAICommands(state: GameState, tick: number): Command[] {
  const commands: Command[] = [];

  const monsters = state.entities.filter(
    (e) => e.kind === EntityKind.MONSTER && canActorAct(state, e.id, tick)
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
  tick: number
): Command | null {
  const { player } = state;
  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));

  // Adjacent: melee attack
  if (distance === 1) {
    return {
      id: 0,
      tick,
      actorId: monster.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: player.id },
      priority: 0,
      source: "AI",
    };
  }

  // Check field of view and distance (only chase if player is visible and within 15 tiles)
  // Use same FOV algorithm as player for consistent vision
  // Slightly longer range than player (9 tiles) to make them more threatening
  const monsterVision = computeFOVFrom(state.map, monster.x, monster.y, 15);
  const playerIndex = idx(player.x, player.y);
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
      const nx = monster.x + moveX;
      const ny = monster.y + moveY;

      if (passable(state.map, nx, ny)) {
        const blocker = state.entities.find(
          (e) =>
            e.x === nx &&
            e.y === ny &&
            (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER)
        );

        if (!blocker) {
          return {
            id: 0,
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
      id: 0,
      tick,
      actorId: monster.id,
      type: CommandType.WAIT,
      data: { type: "WAIT" },
      priority: 0,
      source: "AI",
    };
  }

  // Chase player (simple greedy step)
  const moveX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const moveY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  const nx = monster.x + moveX;
  const ny = monster.y + moveY;

  if (passable(state.map, nx, ny)) {
    const blocker = state.entities.find(
      (e) =>
        e.x === nx &&
        e.y === ny &&
        (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER)
    );

    if (!blocker) {
      return {
        id: 0,
        tick,
        actorId: monster.id,
        type: CommandType.MOVE,
        data: { type: "MOVE", dx: moveX, dy: moveY },
        priority: 0,
        source: "AI",
      };
    }
  }

  // Wait if can't move
  return {
    id: 0,
    tick,
    actorId: monster.id,
    type: CommandType.WAIT,
    data: { type: "WAIT" },
    priority: 0,
    source: "AI",
  };
}
