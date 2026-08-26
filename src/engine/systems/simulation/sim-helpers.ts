import {
  GameState,
  Command,
  CommandType,
  GameEvent,
  Entity,
  EntityKind,
  Monster,
  Player,
  CELL_CONFIG,
  ONLINE_TIME_SCALE,
} from "../../types";
import { bresenhamLine } from "../../math/bresenham";
import { TileSource } from "../../core/tile-source";
import { RNG } from "../../utils/rng";
import {
  IDLE_WANDER_DIRECTIONS,
  MELEE_ARC,
  MONSTER_ACTION_DELAY,
  UTILITY_BOT_REPAIR_COOLDOWN,
  SKULKER_SHOOT_COOLDOWN,
} from "./constants";
import { MonsterType, WeaponType } from "../../types";
import { wrapDelta } from "../../utils/wrap";

/** Coerce an optional amount to a positive integer, or use the fallback. */
export function positiveAmount(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  return fallback;
}

export function getAlivePlayers(state: GameState): Player[] {
  return state.entities.filter(
    (entity): entity is Player =>
      entity.kind === EntityKind.PLAYER && entity.hp > 0,
  );
}

/**
 * Radius-equivalent visible-threat rule used to decide whether resting is
 * safe. It intentionally matches the player's current FOV radius without
 * requiring a second shadowcast during command resolution.
 */
export function hasRestThreat(state: GameState, player: Player): boolean {
  const sightPx = player.sight * CELL_CONFIG.w;
  const sightPxSq = sightPx * sightPx;
  const wraps = state.levelKind === "outside";
  const worldW = state.mapWidth * CELL_CONFIG.w;
  const worldH = state.mapHeight * CELL_CONFIG.h;

  return state.entities.some((entity) => {
    if (
      entity.kind !== EntityKind.MONSTER ||
      (entity as Monster).hp <= 0 ||
      (entity as Monster).friendly
    ) {
      return false;
    }

    const dx = wraps
      ? wrapDelta(player.worldX, entity.worldX, worldW)
      : entity.worldX - player.worldX;
    const dy = wraps
      ? wrapDelta(player.worldY, entity.worldY, worldH)
      : entity.worldY - player.worldY;
    return dx * dx + dy * dy <= sightPxSq;
  });
}

/** Whether every living player currently attached to this plane is resting. */
export function areAllLivingPlayersResting(state: GameState): boolean {
  const livingPlayers = state.players.filter((player) => player.hp > 0);
  return (
    livingPlayers.length > 0 && livingPlayers.every((player) => player.resting)
  );
}

/**
 * Stop resting and clear movement/healing state. Wake immediately returns the
 * simulation to a normal-speed frame so stale rest acceleration cannot turn
 * the next movement input into a brief speed burst.
 */
export function stopPlayerResting(state: GameState, player: Player): void {
  player.resting = false;
  player.restNextHealTick = undefined;
  player.velocityX = 0;
  player.velocityY = 0;
  const normalTimeScale =
    state.multiplayer.mode === "online" ? ONLINE_TIME_SCALE : 0.85;
  state.sim.timeScale = normalTimeScale;
  state.sim.targetTimeScale = normalTimeScale;
}

export function getClosestPlayer(
  state: GameState,
  source: { worldX: number; worldY: number },
): Player | null {
  const players = getAlivePlayers(state);
  if (players.length === 0) return null;

  let closest: Player | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (const player of players) {
    const dx = player.worldX - source.worldX;
    const dy = player.worldY - source.worldY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      closest = player;
    }
  }
  return closest;
}

export function isMonsterMoveCandidateClear(
  state: GameState,
  monster: Monster,
  dx: number,
  dy: number,
): boolean {
  const nx = monster.gridX + dx;
  const ny = monster.gridY + dy;

  if (!state.tiles.canTraverse(monster.gridX, monster.gridY, nx, ny)) {
    return false;
  }

  return !state.entities.some(
    (e) =>
      e.id !== monster.id &&
      e.gridX === nx &&
      e.gridY === ny &&
      (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER),
  );
}

export function chooseIdleWanderDirection(
  state: GameState,
  monster: Monster,
): [number, number] | null {
  const directions = [...IDLE_WANDER_DIRECTIONS];

  while (directions.length > 0) {
    const index = RNG.int(directions.length);
    const [dx, dy] = directions[index];
    directions.splice(index, 1);

    if (isMonsterMoveCandidateClear(state, monster, dx, dy)) {
      return [dx, dy];
    }
  }

  return null;
}

export function makeWaitCommand(monster: Monster, tick: number): Command {
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

export function makeIdleWanderCommand(
  state: GameState,
  monster: Monster,
  tick: number,
): Command {
  const direction = chooseIdleWanderDirection(state, monster);
  if (!direction) return makeWaitCommand(monster, tick);

  const [dx, dy] = direction;
  return {
    id: crypto.randomUUID(),
    tick,
    actorId: monster.id,
    type: CommandType.MOVE,
    data: { type: "MOVE", dx, dy },
    priority: 0,
    source: "AI",
  };
}

export function pushEvent(
  state: GameState,
  event: Omit<GameEvent, "id" | "depth">,
): void {
  const depth = event.cause ? getEventDepth(state, event.cause) + 1 : 0;
  state.eventQueue.push({ ...event, id: crypto.randomUUID(), depth });
}

export function getEventDepth(state: GameState, causeId: string): number {
  const causeEvent = state.eventQueue.find((e) => e.id === causeId);
  return causeEvent ? causeEvent.depth : 0;
}

export function canActorAct(
  state: GameState,
  actorId: string,
  tick: number,
): boolean {
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

export function getActionCost(
  state: GameState,
  cmd: Command,
  actor: Entity,
): number {
  // In planning mode, everyone acts at same rate (turn-based)
  if (state.sim.mode === "PLANNING") {
    return 1;
  }

  // In real-time mode, monsters act slower to give player reaction time at high tick rates
  if (actor.kind === EntityKind.MONSTER) {
    const monster = actor as Monster;
    // Repair workers pause a bit longer after each repair.
    if (
      (monster.type === MonsterType.UTILITY_BOT ||
        monster.occupation?.type === "builder") &&
      cmd.type === CommandType.REPAIR
    ) {
      return MONSTER_ACTION_DELAY + UTILITY_BOT_REPAIR_COOLDOWN;
    }
    // Skulker pistol shots have a longer cooldown than normal monster actions
    if (
      monster.type === MonsterType.SKULKER &&
      cmd.type === CommandType.FIRE &&
      (cmd.data as any).weapon === WeaponType.PISTOL
    ) {
      return SKULKER_SHOOT_COOLDOWN;
    }
    return MONSTER_ACTION_DELAY;
  }

  // Player acts every tick for responsive controls
  return 1;
}

export function directionFromAngle(angle: number): [number, number] {
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

export function normalizeAngle(angle: number): number {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function hasClearLineOfSight(
  tiles: TileSource,
  startWorldX: number,
  startWorldY: number,
  endWorldX: number,
  endWorldY: number,
): boolean {
  const gridX1 = Math.floor(startWorldX / CELL_CONFIG.w);
  const gridY1 = Math.floor(startWorldY / CELL_CONFIG.h);
  const gridX2 = Math.floor(endWorldX / CELL_CONFIG.w);
  const gridY2 = Math.floor(endWorldY / CELL_CONFIG.h);

  return bresenhamLine(gridX1, gridY1, gridX2, gridY2, (x, y) => {
    if (tiles.opaque(x, y)) {
      if ((x !== gridX1 || y !== gridY1) && (x !== gridX2 || y !== gridY2)) {
        return false;
      }
    }
    return true;
  });
}

export function findMeleeTarget(
  state: GameState,
  player: Player,
  facingAngle: number,
): Monster | null {
  let best: Monster | null = null;
  let bestDistance = Infinity;

  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.MONSTER) continue;
    const monster = entity as Monster;
    const dx = monster.worldX - player.worldX;
    const dy = monster.worldY - player.worldY;
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
