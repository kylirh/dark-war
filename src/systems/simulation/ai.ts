import {
  GameState,
  Command,
  CommandType,
  EventType,
  EntityKind,
  Monster,
  MonsterType,
  Player,
  Item,
  ItemType,
  TileType,
  WeaponType,
  CELL_CONFIG,
} from "../../types";
import { idxFor, inBoundsFor, passableFor } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import { isRangedMonster } from "../../content/monster-defs";
import { SoundEffect } from "../sound";
import {
  MONSTER_SPEED,
  MONSTER_ARRIVAL_RADIUS,
  MONSTER_ALERT_DECAY,
  FLEE_HP_RATIO,
  SKULKER_MIN_RANGE_PX,
  SKULKER_MAX_RANGE_PX,
  SKULKER_LOW_AMMO_THRESHOLD,
  SKULKER_SHOOT_MAX_RANGE_PX,
  IDLE_WANDER_SPEED,
  UTILITY_BOT_SPEED,
  UTILITY_BOT_FOLLOW_DIST_PX,
} from "./constants";
import {
  getClosestPlayer,
  chooseIdleWanderDirection,
  makeWaitCommand,
  makeIdleWanderCommand,
  hasClearLineOfSight,
  pushEvent,
  canActorAct,
} from "./sim-helpers";

// ========================================
// Utility Bot Helpers
// ========================================

/**
 * BFS to find the next grid step the utility bot should take toward (toX, toY).
 * Ignores FOV — the bot is omniscient.
 * If (toX, toY) is impassable, navigates to the nearest adjacent passable tile.
 * Returns null when already adjacent or no path exists.
 */
function botNextStep(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): [number, number] | null {
  const { map, mapWidth: w, mapHeight: h } = state;

  // If target is impassable (or a hole), find the closest adjacent passable tile
  let goalX = toX,
    goalY = toY;
  if (
    !passableFor(map, toX, toY, w, h) ||
    map[idxFor(toX, toY, w)] === TileType.HOLE
  ) {
    let bestDsq = Infinity;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as [number, number][]) {
      const nx = toX + dx,
        ny = toY + dy;
      if (inBoundsFor(nx, ny, w, h) && passableFor(map, nx, ny, w, h)) {
        const dsq = (nx - fromX) ** 2 + (ny - fromY) ** 2;
        if (dsq < bestDsq) {
          bestDsq = dsq;
          goalX = nx;
          goalY = ny;
        }
      }
    }
    if (bestDsq === Infinity) return null;
  }

  if (fromX === goalX && fromY === goalY) return null;

  const startIdx = idxFor(fromX, fromY, w);
  const goalIdx = idxFor(goalX, goalY, w);
  const parent = new Map<number, number>();
  parent.set(startIdx, -1);
  const queue: number[] = [startIdx];
  let queueHead = 0;

  let found = false;
  outer: while (queueHead < queue.length) {
    const cur = queue[queueHead++];
    const cx = cur % w,
      cy = Math.floor(cur / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as [number, number][]) {
      const nx = cx + dx,
        ny = cy + dy;
      if (!inBoundsFor(nx, ny, w, h)) continue;
      const nIdx = idxFor(nx, ny, w);
      if (parent.has(nIdx)) continue;
      if (!passableFor(map, nx, ny, w, h)) continue;
      if (map[nIdx] === TileType.HOLE) continue;
      parent.set(nIdx, cur);
      if (nIdx === goalIdx) {
        found = true;
        break outer;
      }
      queue.push(nIdx);
    }
  }

  if (!found) return null;

  // Trace back to the first step after start
  let cur = goalIdx;
  while (parent.get(cur) !== startIdx) {
    const p = parent.get(cur);
    if (p === undefined || p === -1) return null;
    cur = p;
  }
  return [cur % w, Math.floor(cur / w)];
}

/** Steer the bot toward a world-space grid cell using BFS next-step. */
function botSteerToward(
  m: any,
  state: GameState,
  monster: Monster,
  toGridX: number,
  toGridY: number,
): void {
  const step = botNextStep(
    state,
    monster.gridX,
    monster.gridY,
    toGridX,
    toGridY,
  );
  if (!step) {
    m.velocityX = 0;
    m.velocityY = 0;
    return;
  }
  const [sx, sy] = step;
  const swx = sx * CELL_CONFIG.w + CELL_CONFIG.w / 2;
  const swy = sy * CELL_CONFIG.h + CELL_CONFIG.h / 2;
  const dx = swx - m.worldX;
  const dy = swy - m.worldY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 2) {
    m.velocityX = 0;
    m.velocityY = 0;
  } else {
    m.velocityX = (dx / d) * UTILITY_BOT_SPEED;
    m.velocityY = (dy / d) * UTILITY_BOT_SPEED;
  }
}

/**
 * BFS from the bot's position through passable non-hole tiles.
 * Returns the coordinates of the nearest repair target that is actually
 * reachable (has a traversable path to its neighbor). Omniscient — no FOV check.
 */
function findNearestReachableRepairTarget(
  state: GameState,
  fromX: number,
  fromY: number,
): [number, number] | null {
  const { map, mapWidth: w, mapHeight: h, wallDamage } = state;

  const isRepairable = (idx: number): boolean => {
    const tile = map[idx];
    const damage = wallDamage[idx] ?? 0;
    return (
      tile === TileType.HOLE ||
      ((tile === TileType.FLOOR ||
        tile === TileType.WALL ||
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_OPEN ||
        tile === TileType.DOOR_LOCKED) &&
        damage > 0)
    );
  };

  const visited = new Set<number>();
  const queue: number[] = [];
  let queueHead = 0;
  const startIdx = idxFor(fromX, fromY, w);
  queue.push(startIdx);
  visited.add(startIdx);

  while (queueHead < queue.length) {
    const cur = queue[queueHead++];
    const cx = cur % w,
      cy = Math.floor(cur / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][]) {
      const nx = cx + dx,
        ny = cy + dy;
      if (!inBoundsFor(nx, ny, w, h)) continue;
      const nIdx = idxFor(nx, ny, w);
      if (visited.has(nIdx)) continue;
      visited.add(nIdx);

      if (isRepairable(nIdx)) return [nx, ny];

      // Traverse through passable, non-hole floor tiles only
      if (passableFor(map, nx, ny, w, h) && map[nIdx] !== TileType.HOLE) {
        queue.push(nIdx);
      }
    }
  }

  return null;
}

function steerUtilityBot(state: GameState, monster: Monster): void {
  const m = monster as any;

  // Provoked: chase attacker
  if (m.alertLevel > 0) {
    m.alertLevel = Math.max(0, m.alertLevel - MONSTER_ALERT_DECAY);

    // Refresh last known position if attacker still exists
    const attacker = state.entities.find(
      (e) => e.id === m.lastAttackerId,
    ) as any;
    if (attacker) {
      m.lastKnownPlayerX = attacker.worldX;
      m.lastKnownPlayerY = attacker.worldY;
    }

    const kx = m.lastKnownPlayerX - m.worldX;
    const ky = m.lastKnownPlayerY - m.worldY;
    const kd = Math.sqrt(kx * kx + ky * ky);
    if (kd > CELL_CONFIG.w * 0.8) {
      botSteerToward(
        m,
        state,
        monster,
        Math.floor(m.lastKnownPlayerX / CELL_CONFIG.w),
        Math.floor(m.lastKnownPlayerY / CELL_CONFIG.h),
      );
    } else {
      m.velocityX = 0;
      m.velocityY = 0;
    }
    return;
  }

  // Omniscient repair search — use sticky target to avoid oscillating between equidistant tiles
  {
    // Validate current sticky target
    if (m.currentRepairTarget) {
      const [cx, cy] = m.currentRepairTarget as [number, number];
      if (inBoundsFor(cx, cy, state.mapWidth, state.mapHeight)) {
        const cidx = idxFor(cx, cy, state.mapWidth);
        const ctile = state.map[cidx];
        const cdmg = state.wallDamage[cidx] ?? 0;
        const stillRepairable =
          ctile === TileType.HOLE ||
          ((ctile === TileType.FLOOR ||
            ctile === TileType.WALL ||
            ctile === TileType.DOOR_CLOSED ||
            ctile === TileType.DOOR_OPEN ||
            ctile === TileType.DOOR_LOCKED) &&
            cdmg > 0);
        if (!stillRepairable) m.currentRepairTarget = null;
      } else {
        m.currentRepairTarget = null;
      }
    }

    // Find a new target only if we don't have one
    if (!m.currentRepairTarget) {
      m.currentRepairTarget = findNearestReachableRepairTarget(
        state,
        monster.gridX,
        monster.gridY,
      );
    }

    const target = m.currentRepairTarget as [number, number] | null;
    if (target) {
      const [tx, ty] = target;
      const adx = Math.abs(tx - monster.gridX);
      const ady = Math.abs(ty - monster.gridY);
      if (adx + ady <= 1) {
        // Already adjacent — stand still so the command system can repair
        m.velocityX = 0;
        m.velocityY = 0;
      } else {
        botSteerToward(m, state, monster, tx, ty);
      }
      return;
    }
  }

  // No repairs — follow the player at a comfortable distance
  const player = getClosestPlayer(state, monster);
  if (player) {
    const px = player.worldX;
    const py = player.worldY;
    const dx = px - m.worldX;
    const dy = py - m.worldY;
    const d = Math.sqrt(dx * dx + dy * dy);
    const BOT_BACK_OFF_DIST = CELL_CONFIG.w * 1.5; // ~48px — back away if player too close
    if (d < BOT_BACK_OFF_DIST) {
      // Move away from player
      const len = d > 0.1 ? d : 1;
      const speed = IDLE_WANDER_SPEED;
      m.velocityX = (-dx / len) * speed;
      m.velocityY = (-dy / len) * speed;
    } else if (d > UTILITY_BOT_FOLLOW_DIST_PX) {
      botSteerToward(
        m,
        state,
        monster,
        Math.floor(px / CELL_CONFIG.w),
        Math.floor(py / CELL_CONFIG.h),
      );
    } else {
      m.velocityX = 0;
      m.velocityY = 0;
    }
    return;
  }

  m.velocityX = 0;
  m.velocityY = 0;
}

// ========================================
// Steering Behaviors (Continuous Movement AI)
// ========================================

/**
 * Update monster velocities using steering behaviors
 * Called every MONSTER_AI_UPDATE_INTERVAL ticks
 */
const PET_SPEED = 215; // px/s for friendly pets chasing/following
const PET_HOSTILE_RANGE_PX = CELL_CONFIG.w * 8;
const PET_FOLLOW_DIST_PX = CELL_CONFIG.w * 2.5;
const PET_MELEE_RANGE_PX = CELL_CONFIG.w * 1.5;

/** Nearest hostile (non-friendly) monster to a pet, within range. */
function nearestHostileMonster(
  state: GameState,
  pet: Monster,
  rangePx: number,
): Monster | null {
  let best: Monster | null = null;
  let bestSq = rangePx * rangePx;
  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.MONSTER) continue;
    const other = entity as Monster;
    if (other.id === pet.id || other.friendly || other.hp <= 0) continue;
    const dx = other.worldX - pet.worldX;
    const dy = other.worldY - pet.worldY;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      best = other;
    }
  }
  return best;
}

function petOwner(state: GameState, pet: Monster): Player | null {
  const owner = state.entities.find(
    (e) => e.kind === EntityKind.PLAYER && e.id === pet.ownerId,
  ) as Player | undefined;
  return owner ?? getClosestPlayer(state, pet);
}

/** Friendly pets chase the nearest enemy, else trot back to their owner. */
function steerFriendlyPet(state: GameState, monster: Monster): void {
  const m = monster as any;
  const enemy = nearestHostileMonster(state, monster, PET_HOSTILE_RANGE_PX);
  let targetX: number | null = null;
  let targetY: number | null = null;

  if (enemy) {
    targetX = (enemy as any).worldX;
    targetY = (enemy as any).worldY;
  } else {
    const owner = petOwner(state, monster);
    if (owner && "worldX" in owner) {
      const dx = (owner as any).worldX - m.worldX;
      const dy = (owner as any).worldY - m.worldY;
      if (Math.hypot(dx, dy) > PET_FOLLOW_DIST_PX) {
        targetX = (owner as any).worldX;
        targetY = (owner as any).worldY;
      }
    }
  }

  if (targetX === null || targetY === null) {
    m.velocityX = 0;
    m.velocityY = 0;
    return;
  }
  const dx = targetX - m.worldX;
  const dy = targetY - m.worldY;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    m.velocityX = 0;
    m.velocityY = 0;
    return;
  }
  m.velocityX = (dx / d) * PET_SPEED;
  m.velocityY = (dy / d) * PET_SPEED;
  m.facingAngle = Math.atan2(dy, dx);
}

/** A pet bites a hostile in range; otherwise waits (movement is steering). */
function decideFriendlyPetCommand(
  state: GameState,
  monster: Monster,
  tick: number,
): Command | null {
  const enemy = nearestHostileMonster(state, monster, PET_MELEE_RANGE_PX);
  if (enemy) {
    const name = monster.name ?? "Your pet";
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: `${name} bites the ${enemy.type}!` },
    });
    return {
      id: "",
      tick,
      actorId: monster.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: enemy.id },
      priority: 0,
      source: "AI",
    };
  }
  return makeWaitCommand(monster, tick);
}

export function updateMonsterSteering(state: GameState): void {
  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.MONSTER) continue;
    const monster = entity as Monster;
    if (!("worldX" in monster) || !("worldY" in monster)) continue;

    if (monster.type === MonsterType.UTILITY_BOT) {
      steerUtilityBot(state, monster);
      continue;
    }

    if (monster.friendly) {
      steerFriendlyPet(state, monster);
      continue;
    }

    const player = getClosestPlayer(state, monster);
    if (!player) {
      const direction = chooseIdleWanderDirection(state, monster);
      if (direction) {
        const [dx, dy] = direction;
        const length = Math.sqrt(dx * dx + dy * dy);
        monster.velocityX = (dx / length) * IDLE_WANDER_SPEED;
        monster.velocityY = (dy / length) * IDLE_WANDER_SPEED;
      } else {
        monster.velocityX = 0;
        monster.velocityY = 0;
      }
      continue;
    }

    const m = monster as any;
    const p = player as any;

    const dx = p.worldX - m.worldX;
    const dy = p.worldY - m.worldY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const dirX = pixelDistance > 0 ? dx / pixelDistance : 0;
    const dirY = pixelDistance > 0 ? dy / pixelDistance : 0;

    // Cheaper Bresenham LOS check with range limit vs full shadowcasting FOV
    const gridDistSq =
      (monster.gridX - player.gridX) ** 2 + (monster.gridY - player.gridY) ** 2;
    const canSeePlayer =
      gridDistSq <= 15 * 15 &&
      hasClearLineOfSight(state.tiles, m.worldX, m.worldY, p.worldX, p.worldY);

    if (!canSeePlayer) {
      m.alertLevel = Math.max(0, (m.alertLevel ?? 0) - MONSTER_ALERT_DECAY);

      if (m.alertLevel > 0) {
        // Investigate last known position
        const kx = (m.lastKnownPlayerX ?? m.worldX) - m.worldX;
        const ky = (m.lastKnownPlayerY ?? m.worldY) - m.worldY;
        const kd = Math.sqrt(kx * kx + ky * ky);
        if (kd > CELL_CONFIG.w * 1.5) {
          m.velocityX = (kx / kd) * MONSTER_SPEED * 0.75;
          m.velocityY = (ky / kd) * MONSTER_SPEED * 0.75;
        } else {
          m.alertLevel = 0;
          m.velocityX = 0;
          m.velocityY = 0;
        }
      } else if (RNG.chance(0.1)) {
        const angle = RNG.int(8) * (Math.PI / 4);
        m.velocityX = Math.cos(angle) * MONSTER_SPEED * 0.5;
        m.velocityY = Math.sin(angle) * MONSTER_SPEED * 0.5;
      } else {
        m.velocityX = 0;
        m.velocityY = 0;
      }
      continue;
    }

    // Player is visible — update alert memory
    m.alertLevel = 100;
    m.lastKnownPlayerX = p.worldX;
    m.lastKnownPlayerY = p.worldY;

    const isFleeing = m.hp <= (m.hpMax ?? m.hp) * FLEE_HP_RATIO;

    if (isFleeing) {
      m.velocityX = -dirX * MONSTER_SPEED;
      m.velocityY = -dirY * MONSTER_SPEED;
      continue;
    }

    if (isRangedMonster(monster.type)) {
      // When low on bullets, seek nearby ammo pickups
      if (monster.bullets < SKULKER_LOW_AMMO_THRESHOLD) {
        const AMMO_SEEK_RADIUS = CELL_CONFIG.w * 8;
        let nearestAmmo: Item | null = null;
        let nearestAmmoDist = AMMO_SEEK_RADIUS;
        for (const e of state.entities) {
          if (e.kind !== EntityKind.ITEM) continue;
          const item = e as Item;
          if (item.type !== ItemType.AMMO) continue;
          const adx = item.worldX - m.worldX;
          const ady = item.worldY - m.worldY;
          const adist = Math.sqrt(adx * adx + ady * ady);
          if (adist < nearestAmmoDist) {
            nearestAmmoDist = adist;
            nearestAmmo = item;
          }
        }
        if (nearestAmmo && nearestAmmoDist > CELL_CONFIG.w * 0.5) {
          const adx = nearestAmmo.worldX - m.worldX;
          const ady = nearestAmmo.worldY - m.worldY;
          m.velocityX = (adx / nearestAmmoDist) * MONSTER_SPEED;
          m.velocityY = (ady / nearestAmmoDist) * MONSTER_SPEED;
          continue;
        }
      }

      if (pixelDistance < SKULKER_MIN_RANGE_PX) {
        m.velocityX = -dirX * MONSTER_SPEED;
        m.velocityY = -dirY * MONSTER_SPEED;
      } else if (pixelDistance > SKULKER_MAX_RANGE_PX) {
        m.velocityX = dirX * MONSTER_SPEED * 0.6;
        m.velocityY = dirY * MONSTER_SPEED * 0.6;
      } else {
        // Strafe perpendicular to player
        m.velocityX = -dirY * MONSTER_SPEED * 0.35;
        m.velocityY = dirX * MONSTER_SPEED * 0.35;
      }
      continue;
    }

    if (pixelDistance <= MONSTER_ARRIVAL_RADIUS) {
      m.velocityX = 0;
      m.velocityY = 0;
    } else {
      m.velocityX = dirX * MONSTER_SPEED;
      m.velocityY = dirY * MONSTER_SPEED;
    }
  }
}

// ========================================
// AI Command Generation
// ========================================

export function generateAICommands(state: GameState, tick: number): Command[] {
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

function decideUtilityBotCommand(
  state: GameState,
  monster: Monster,
  tick: number,
): Command {
  const m = monster as any;
  const waitCmd = (): Command => makeWaitCommand(monster, tick);

  // Provoked: fight back if attacker is in melee range
  if (m.alertLevel > 0) {
    const attacker = state.entities.find(
      (e) => e.id === m.lastAttackerId,
    ) as any;
    if (attacker) {
      const dx = attacker.worldX - m.worldX;
      const dy = attacker.worldY - m.worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CELL_CONFIG.w * 1.5) {
        return {
          id: crypto.randomUUID(),
          tick,
          actorId: monster.id,
          type: CommandType.MELEE,
          data: { type: "MELEE", targetId: attacker.id },
          priority: 0,
          source: "AI",
        };
      }
    }
    return waitCmd();
  }

  // Check if there is an adjacent repairable tile — prefer the sticky target
  const adjacent: [number, number][] = [
    [monster.gridX, monster.gridY - 1],
    [monster.gridX, monster.gridY + 1],
    [monster.gridX - 1, monster.gridY],
    [monster.gridX + 1, monster.gridY],
  ];

  // Sort adjacent list so the sticky target comes first
  const sticky = m.currentRepairTarget as [number, number] | null;
  if (sticky) {
    adjacent.sort((a, b) => {
      const aIsSticky = a[0] === sticky[0] && a[1] === sticky[1] ? -1 : 0;
      const bIsSticky = b[0] === sticky[0] && b[1] === sticky[1] ? -1 : 0;
      return aIsSticky - bIsSticky;
    });
  }

  for (const [tx, ty] of adjacent) {
    if (!inBoundsFor(tx, ty, state.mapWidth, state.mapHeight)) continue;
    const idx = idxFor(tx, ty, state.mapWidth);
    const tile = state.map[idx];
    const damage = state.wallDamage[idx] ?? 0;
    const repairable =
      tile === TileType.HOLE ||
      ((tile === TileType.FLOOR ||
        tile === TileType.WALL ||
        tile === TileType.DOOR_CLOSED ||
        tile === TileType.DOOR_OPEN ||
        tile === TileType.DOOR_LOCKED) &&
        damage > 0);

    if (repairable) {
      // Update sticky target to the one we're actually repairing
      m.currentRepairTarget = [tx, ty];
      return {
        id: crypto.randomUUID(),
        tick,
        actorId: monster.id,
        type: CommandType.REPAIR,
        data: { type: "REPAIR", x: tx, y: ty },
        priority: 0,
        source: "AI",
      };
    }
  }

  // Nothing to repair — maybe nuzzle the player
  const player = getClosestPlayer(state, monster);
  if (player && m.alertLevel === 0) {
    const dx = player.worldX - m.worldX;
    const dy = player.worldY - m.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hpMax = m.hpMax ?? monster.hp;
    const isHealthy = monster.hp > hpMax * 0.5;
    const NUZZLE_COOLDOWN = 120; // ticks (~6 seconds)
    const lastNuzzle = m.lastNuzzleTick ?? -999;
    if (
      dist < CELL_CONFIG.w * 3 &&
      isHealthy &&
      tick - lastNuzzle > NUZZLE_COOLDOWN &&
      RNG.chance(0.15)
    ) {
      m.lastNuzzleTick = tick;
      const bwx = m.worldX ?? monster.gridX * CELL_CONFIG.w;
      const bwy = m.worldY ?? monster.gridY * CELL_CONFIG.h;
      state.pendingSounds.push({
        effect: SoundEffect.BEEP,
        worldX: bwx,
        worldY: bwy,
      });
      const nuzzleMessages = [
        "The utility bot nuggles up to you.",
        "The utility bot purrs and nuzzles into you.",
        "The utility bot makes happy, content noises.",
      ];
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: {
          type: "MESSAGE",
          message:
            nuzzleMessages[Math.floor(Math.random() * nuzzleMessages.length)],
        },
      });
    }
  }

  return waitCmd();
}

function decideMonsterCommand(
  state: GameState,
  monster: Monster,
  tick: number,
): Command | null {
  if (monster.type === MonsterType.UTILITY_BOT) {
    return decideUtilityBotCommand(state, monster, tick);
  }

  if (monster.friendly) {
    return decideFriendlyPetCommand(state, monster, tick);
  }

  const player = getClosestPlayer(state, monster);
  if (!player) {
    return makeIdleWanderCommand(state, monster, tick);
  }

  const isSkulker = isRangedMonster(monster.type);

  const waitCmd = (): Command => makeWaitCommand(monster, tick);

  // Calculate distance - prefer continuous if available
  let distance: number;
  let inMeleeRange = false;

  if ("worldX" in monster && "worldX" in player) {
    const dx = player.worldX - monster.worldX;
    const dy = player.worldY - monster.worldY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    distance = pixelDistance / CELL_CONFIG.w;
    const MELEE_RANGE = CELL_CONFIG.w * 1.5;
    inMeleeRange = pixelDistance <= MELEE_RANGE;
  } else {
    const dx = player.gridX - monster.gridX;
    const dy = player.gridY - monster.gridY;
    distance = Math.max(Math.abs(dx), Math.abs(dy));
    inMeleeRange = distance === 1;
  }

  // Skulkers skip melee; fleeing monsters still fight back when cornered
  if (inMeleeRange && !isSkulker) {
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

  // Attack utility bot if it's in the way
  const nearbyBot = state.entities.find((e) => {
    if (e.kind !== EntityKind.MONSTER) return false;
    if ((e as any).type !== MonsterType.UTILITY_BOT) return false;
    const dx = e.worldX - monster.worldX;
    const dy = e.worldY - monster.worldY;
    return Math.sqrt(dx * dx + dy * dy) <= CELL_CONFIG.w * 1.5;
  });
  if (nearbyBot) {
    return {
      id: crypto.randomUUID(),
      tick,
      actorId: monster.id,
      type: CommandType.MELEE,
      data: { type: "MELEE", targetId: nearbyBot.id },
      priority: 0,
      source: "AI",
    };
  }

  // Monsters scrap with each other when crowded and alert
  if (!inMeleeRange && (monster.alertLevel ?? 0) > 0 && RNG.chance(0.4)) {
    const blockingMonster = state.entities.find((e) => {
      if (e.kind !== EntityKind.MONSTER || e.id === monster.id) return false;
      if ((e as any).type === MonsterType.UTILITY_BOT) return false;
      const dx = e.worldX - monster.worldX;
      const dy = e.worldY - monster.worldY;
      return Math.sqrt(dx * dx + dy * dy) <= CELL_CONFIG.w * 1.5;
    });
    if (blockingMonster) {
      return {
        id: crypto.randomUUID(),
        tick,
        actorId: monster.id,
        type: CommandType.MELEE,
        data: { type: "MELEE", targetId: blockingMonster.id },
        priority: 0,
        source: "AI",
      };
    }
  }

  // Throw grenade — skulkers are more aggressive throwers
  const monsterWorldX = monster.worldX;
  const monsterWorldY = monster.worldY;
  const playerWorldX = player.worldX;
  const playerWorldY = player.worldY;
  const hasGrenadeLOS = hasClearLineOfSight(
    state.tiles,
    monsterWorldX,
    monsterWorldY,
    playerWorldX,
    playerWorldY,
  );

  const grenadeChance = isSkulker ? 0.55 : 0.35;
  if (
    monster.grenades > 0 &&
    distance <= 8 &&
    distance >= 2 &&
    hasGrenadeLOS &&
    RNG.chance(grenadeChance)
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

  // Lay land mine — skulkers skip this (they prefer distance)
  if (
    !isSkulker &&
    monster.landMines > 0 &&
    distance <= 3 &&
    RNG.chance(0.25)
  ) {
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

  const aiGridDistSq =
    (monster.gridX - player.gridX) ** 2 + (monster.gridY - player.gridY) ** 2;
  const canSeePlayer =
    aiGridDistSq <= 15 * 15 &&
    hasClearLineOfSight(
      state.tiles,
      monster.worldX,
      monster.worldY,
      player.worldX,
      player.worldY,
    );

  if (!canSeePlayer) {
    // Alert: steering already moves toward last known pos; command system just waits/wanders
    if ((monster.alertLevel ?? 0) > 0) {
      return waitCmd();
    }

    // Idle wander or wait
    if (RNG.chance(0.2)) {
      return makeIdleWanderCommand(state, monster, tick);
    }

    return waitCmd();
  }

  // Skulkers: steering handles velocity; shoot at visible targets with pistol
  if (isSkulker) {
    if (
      monster.bullets > 0 &&
      distance <= SKULKER_SHOOT_MAX_RANGE_PX / CELL_CONFIG.w &&
      hasGrenadeLOS
    ) {
      return {
        id: crypto.randomUUID(),
        tick,
        actorId: monster.id,
        type: CommandType.FIRE,
        data: { type: "FIRE", dx: 0, dy: 0, weapon: WeaponType.PISTOL },
        priority: 1,
        source: "AI",
      };
    }
    return waitCmd();
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

    if (!passableFor(state.map, nx, ny, state.mapWidth, state.mapHeight)) {
      return false;
    }

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
