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
  TileType,
  ItemType,
  WeaponType,
  CELL_CONFIG,
} from "../../types";
import { inBoundsFor, idxFor } from "../../utils/helpers";
import {
  editStateCell,
  setStateDamageAtIndex,
  setStateTile,
} from "../../utils/state-tiles";
import { applyWallDamageAt } from "../../utils/walls";
import { applyRepairAt } from "../../utils/repair";
import {
  canAddToInventory,
  removeFromInventory,
  weaponTypeForItem,
} from "../../utils/inventory";
import { MONSTER_DEFS } from "../../content/monster-defs";
import { ITEM_DEFS, itemName } from "../../content/item-defs";
import { minedItemForTile, placedTileForItem } from "../../content/block-defs";
import { tileIsPassable } from "../../core/tile-source";
import { ItemEntity } from "../../entities/item-entity";
import { RNG } from "../../utils/rng";
import { SoundEffect } from "../../content/sound-effects";
import {
  PlayerWeaponCalloutSituation,
  selectPlayerWeaponCallout,
} from "../../content/player-weapon-callouts";
import { emitWorldTextCallout } from "../../utils/world-callouts";
import { BulletEntity } from "../../entities/bullet-entity";
import { ExplosiveEntity } from "../../entities/explosive-entity";
import { portalAt } from "../../core/world-space";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../../core/world-semantics";
import {
  equippedMonsterWeaponType,
  isAdaptiveWeaponMonster,
  MONSTER_LASER_SHOT_COST,
  MONSTER_SHOTGUN_AMMO_COST,
  monsterMeleeDamage,
} from "../../utils/monster-weapons";
import {
  SIM_DT_MS,
  GRENADE_FUSE_TICKS,
  EXPLOSIVE_OWNER_GRACE_TICKS,
  MELEE_KNOCKBACK_DISTANCE,
  SKULKER_SHOT_VARIANCE,
  SKULKER_BULLET_SPEED,
  SKULKER_SHOOT_MAX_RANGE_PX,
  MATTER_MANIPULATOR_RANGE,
  MAX_EDITABLE_ELEVATION,
  MIN_EDITABLE_ELEVATION,
} from "./constants";
import {
  pushEvent,
  getActionCost,
  directionFromAngle,
  findMeleeTarget,
  getClosestPlayer,
} from "./sim-helpers";

// ========================================
// Command Management
// ========================================

const THROW_SOUNDS = [
  SoundEffect.THROW_1,
  SoundEffect.THROW_2,
  SoundEffect.THROW_3,
  SoundEffect.THROW_4,
  SoundEffect.THROW_5,
];
const RELOAD_CALLOUT_COOLDOWN_TICKS = Math.ceil(30_000 / SIM_DT_MS);
const DEPLETED_CALLOUT_COOLDOWN_TICKS = Math.ceil(10_000 / SIM_DT_MS);

function activePlayerItem(player: Player): ItemType | null {
  return player.inventorySlots[player.selectedBarSlot]?.type ?? null;
}

function playerCanMelee(player: Player): boolean {
  const active = activePlayerItem(player);
  return active === null || ITEM_DEFS[active]?.category === "weapon-melee";
}

function queuePlayerThrowSound(state: GameState, player: Player): void {
  state.pendingSounds.push({
    effect: RNG.choose(THROW_SOUNDS),
    sourceId: player.id,
  });
}

function maybeEmitPlayerWeaponCallout(
  state: GameState,
  player: Player,
  weapon: WeaponType,
  situation: PlayerWeaponCalloutSituation,
  commandId: string,
): void {
  const readyTick =
    situation === "reloaded"
      ? (player.weaponReloadCalloutReadyTick ?? 0)
      : (player.weaponDepletedCalloutReadyTick ?? 0);
  if (state.sim.nowTick < readyTick) return;

  const line = selectPlayerWeaponCallout(weapon, situation, commandId);
  if (!line) return;
  if (situation === "reloaded") {
    player.weaponReloadCalloutReadyTick =
      state.sim.nowTick + RELOAD_CALLOUT_COOLDOWN_TICKS;
  } else {
    player.weaponDepletedCalloutReadyTick =
      state.sim.nowTick + DEPLETED_CALLOUT_COOLDOWN_TICKS;
  }
  emitWorldTextCallout(state, {
    kind: line.kind,
    text: line.text,
    speakerId: player.id,
  });
}

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
export function cleanupOldCommands(
  state: GameState,
  currentTick: number,
): void {
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
    case CommandType.USE_ITEM:
      resolveUseItemCommand(state, cmd);
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
    case CommandType.MINE:
      resolveMineCommand(state, cmd);
      break;
    case CommandType.PLACE_BLOCK:
      resolvePlaceBlockCommand(state, cmd);
      break;
    case CommandType.SHAPE_TERRAIN:
      resolveShapeTerrainCommand(state, cmd);
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
  if (!state.tiles.canTraverse(actor.gridX, actor.gridY, nx, ny)) {
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

      const dx = entity.worldX - targetWorldX;
      const dy = entity.worldY - targetWorldY;

      if (dx * dx + dy * dy < MELEE_RANGE_SQ) {
        blocker = entity;
        break;
      }
    }
  }

  if (blocker) {
    // Don't attack your own friendly pets by walking into them.
    if (
      actor.kind === EntityKind.PLAYER &&
      blocker.kind === EntityKind.MONSTER &&
      (blocker as Monster).friendly
    ) {
      return false;
    }
    // If player trying to move into monster, convert to melee attack
    if (
      actor.kind === EntityKind.PLAYER &&
      blocker.kind === EntityKind.MONSTER
    ) {
      if (!playerCanMelee(actor as Player)) return false;
      pushEvent(state, {
        type: EventType.DAMAGE,
        data: {
          type: "DAMAGE",
          targetId: blocker.id,
          amount: 1,
          sourceId: actor.id,
          knockbackX: blocker.worldX - actor.worldX,
          knockbackY: blocker.worldY - actor.worldY,
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

    // Calculate direction and set velocity
    const dx = targetWorldX - actor.worldX;
    const dy = targetWorldY - actor.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      // Movement speed: 225 pixels per second for smooth motion
      const speed = 225;
      actor.velocityX = (dx / dist) * speed;
      actor.velocityY = (dy / dist) * speed;

      // Update facing angle
      actor.facingAngle = Math.atan2(dy, dx);
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
  if (
    attacker.kind === EntityKind.PLAYER &&
    !playerCanMelee(attacker as Player)
  ) {
    return;
  }
  if (
    attacker.kind === EntityKind.MONSTER &&
    target.kind === EntityKind.MONSTER &&
    (attacker as Monster).type === MonsterType.ICKY_LUMP &&
    (target as Monster).type === MonsterType.ICKY_LUMP
  ) {
    return;
  }

  // Check adjacency - support both grid-based and continuous coordinates
  let inRange = false;

  if ("worldX" in attacker && "worldX" in target) {
    // Use continuous distance check
    const dx = attacker.worldX - target.worldX;
    const dy = attacker.worldY - target.worldY;
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
    const monster = attacker as Monster;
    damage = isAdaptiveWeaponMonster(monster)
      ? monsterMeleeDamage(monster)
      : monster.dmg;
    // Multi-hit creatures (tentacular horror) strike several times at once.
    const multiHit = MONSTER_DEFS[monster.type]?.flags?.multiHit ?? 1;
    if (multiHit > 1) damage *= multiHit;

    if (monster.type === MonsterType.ICKY_LUMP) {
      const ickyLumpHitSounds = [
        SoundEffect.ICKY_LUMP_HIT_1,
        SoundEffect.ICKY_LUMP_HIT_2,
        SoundEffect.ICKY_LUMP_HIT_3,
      ];
      state.pendingSounds.push({
        effect: ickyLumpHitSounds[RNG.int(ickyLumpHitSounds.length)],
        worldX: monster.worldX,
        worldY: monster.worldY,
      });
    }
  }

  pushEvent(state, {
    type: EventType.DAMAGE,
    data: {
      type: "DAMAGE",
      targetId: target.id,
      amount: damage,
      sourceId: attacker.id,
      knockbackX: target.worldX - attacker.worldX,
      knockbackY: target.worldY - attacker.worldY,
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

    const angle = player.facingAngle;
    const weapon = weaponOverride ?? player.weapon;

    // Launch a bullet from the muzzle (in front of the player, outside its body).
    const launchBullet = (
      aim: number,
      damage: number,
      speed = 600,
      maxDistance = 640,
    ): void => {
      const MUZZLE_OFFSET = 16;
      state.entityManager.spawn(
        new BulletEntity(
          player.worldX + Math.cos(aim) * MUZZLE_OFFSET,
          player.worldY + Math.sin(aim) * MUZZLE_OFFSET,
          Math.cos(aim) * speed,
          Math.sin(aim) * speed,
          damage,
          player.id,
          maxDistance,
        ),
      );
    };

    // Melee damage scales with the equipped blade.
    const meleeWeapon = activePlayerItem(player);
    const meleeDamage =
      meleeWeapon === ItemType.VIBRA_SWORD
        ? 7
        : meleeWeapon === ItemType.MACRO_METAL_SWORD
          ? 5
          : meleeWeapon === ItemType.BUTCHER_KNIFE
            ? 3
            : meleeWeapon === ItemType.PICKAXE
              ? 1
              : 2;

    switch (weapon) {
      case WeaponType.MELEE: {
        if (!playerCanMelee(player)) return;
        if (meleeWeapon === ItemType.VIBRA_SWORD) {
          const vibraSwordSounds = [
            SoundEffect.VIBRA_SWORD_1,
            SoundEffect.VIBRA_SWORD_2,
            SoundEffect.VIBRA_SWORD_3,
            SoundEffect.VIBRA_SWORD_4,
            SoundEffect.VIBRA_SWORD_5,
            SoundEffect.VIBRA_SWORD_6,
            SoundEffect.VIBRA_SWORD_7,
          ];
          state.pendingSounds.push({
            effect: vibraSwordSounds[RNG.int(vibraSwordSounds.length)],
          });
        } else if (meleeWeapon === ItemType.MACRO_METAL_SWORD) {
          const macroMetalSwordSounds = [
            SoundEffect.MACRO_METAL_SWORD_1,
            SoundEffect.MACRO_METAL_SWORD_2,
          ];
          state.pendingSounds.push({
            effect: RNG.choose(macroMetalSwordSounds),
          });
        }
        const target = findMeleeTarget(state, player, angle);
        if (!target) {
          if (meleeWeapon === ItemType.PICKAXE) {
            const dx = Math.round(Math.cos(angle));
            const dy = Math.round(Math.sin(angle));
            const targetX = player.gridX + dx;
            const targetY = player.gridY + dy;
            const targetTile = state.tiles.getTile(targetX, targetY);
            if (targetTile === TileType.HOLOWALL) {
              msg(state, "The pickaxe cannot affect the holowall.", cmd.id);
              return;
            }
            if (
              (targetTile === TileType.WALL || targetTile === TileType.FLOOR) &&
              applyWallDamageAt(state, targetX, targetY, 1)
            ) {
              msg(
                state,
                targetTile === TileType.WALL
                  ? "You chip the wall with the pickaxe."
                  : "You chip the floor with the pickaxe.",
                cmd.id,
              );
              return;
            }
          }
          state.pendingSounds.push({ effect: SoundEffect.MISS });
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
            amount: meleeDamage,
            sourceId: player.id,
            knockbackX: target.worldX - player.worldX,
            knockbackY: target.worldY - player.worldY,
            knockbackDistance: MELEE_KNOCKBACK_DISTANCE,
          },
        });
        return;
      }
      case WeaponType.PISTOL: {
        if (player.ammo <= 0) {
          maybeEmitPlayerWeaponCallout(
            state,
            player,
            WeaponType.PISTOL,
            "depleted",
            cmd.id,
          );
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "*click* Out of ammo!" },
          });
          return;
        }

        player.ammo--;
        state.pendingSounds.push({
          effect: SoundEffect.SHOOT,
          sourceId: player.id,
        });

        const BULLET_SPEED = 600; // pixels per second
        // Spawn at the muzzle: just in front of the player along the aim, outside
        // the player's collision body. This keeps the bullet from appearing
        // behind the (client-predicted) player online and from ever colliding
        // with the shooter — even while moving.
        const MUZZLE_OFFSET = 16; // player radius (8) + bullet radius (4) + margin
        const spawnX = player.worldX + Math.cos(angle) * MUZZLE_OFFSET;
        const spawnY = player.worldY + Math.sin(angle) * MUZZLE_OFFSET;
        const bullet = new BulletEntity(
          spawnX,
          spawnY,
          Math.cos(angle) * BULLET_SPEED,
          Math.sin(angle) * BULLET_SPEED,
          2,
          player.id,
          640,
        );

        state.entityManager.spawn(bullet);
        return;
      }
      case WeaponType.SMG: {
        // Spray and pray: fast (client auto-repeats), light, with a little spread.
        if (player.ammo <= 0) {
          maybeEmitPlayerWeaponCallout(
            state,
            player,
            WeaponType.SMG,
            "depleted",
            cmd.id,
          );
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "*click* Out of ammo!" },
          });
          return;
        }
        player.ammo--;
        const smgSounds = [SoundEffect.SMG_SHOOT_1, SoundEffect.SMG_SHOOT_2];
        state.pendingSounds.push({
          effect: smgSounds[RNG.int(smgSounds.length)],
          sourceId: player.id,
        });
        const spread = (RNG.int(11) - 5) * 0.012; // ±~0.06 rad
        launchBullet(angle + spread, 2, 640, 560);
        return;
      }
      case WeaponType.SHOTGUN: {
        // One loud blast of pellets; eats ammo fast and has shorter range.
        const SHELL_COST = 4; // a full shell is four rounds
        if (player.ammo < SHELL_COST) {
          maybeEmitPlayerWeaponCallout(
            state,
            player,
            WeaponType.SHOTGUN,
            "depleted",
            cmd.id,
          );
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: { type: "MESSAGE", message: "*click* Out of shells!" },
          });
          return;
        }
        const PELLETS = 6;
        const SPREAD = 0.42; // total cone width (rad)
        player.ammo -= SHELL_COST; // heavy ammo use
        const shotgunSounds = [
          SoundEffect.SHOTGUN_BLAST_1,
          SoundEffect.SHOTGUN_BLAST_2,
          SoundEffect.SHOTGUN_BLAST_3,
        ];
        state.pendingSounds.push({
          effect: shotgunSounds[RNG.int(shotgunSounds.length)],
          sourceId: player.id,
        });
        for (let i = 0; i < PELLETS; i++) {
          const t = i / (PELLETS - 1) - 0.5; // -0.5 .. +0.5 across the cone
          launchBullet(angle + t * SPREAD, 2, 560, 360);
        }
        return;
      }
      case WeaponType.LASER: {
        // Charge-powered beam: much faster than a ballistic round and able to
        // reflect from at most two surfaces without losing speed.
        if (player.laserCharge <= 0) {
          maybeEmitPlayerWeaponCallout(
            state,
            player,
            WeaponType.LASER,
            "depleted",
            cmd.id,
          );
          state.pendingSounds.push({
            effect: SoundEffect.CLICK,
            sourceId: player.id,
          });
          pushEvent(state, {
            type: EventType.MESSAGE,
            data: {
              type: "MESSAGE",
              message: "Laser depleted — insert a power cell.",
            },
          });
          return;
        }
        player.laserCharge = Math.max(0, player.laserCharge - 5);
        const laserSounds = [
          SoundEffect.LASER_SHOOT_1,
          SoundEffect.LASER_SHOOT_2,
          SoundEffect.LASER_SHOOT_3,
          SoundEffect.LASER_SHOOT_4,
        ];
        state.pendingSounds.push({
          effect: laserSounds[RNG.int(laserSounds.length)],
          sourceId: player.id,
        });
        const LASER_SPEED = 3600;
        const LASER_RANGE = 1536;
        const MUZZLE_OFFSET = 16;
        state.entityManager.spawn(
          new BulletEntity(
            player.worldX + Math.cos(angle) * MUZZLE_OFFSET,
            player.worldY + Math.sin(angle) * MUZZLE_OFFSET,
            Math.cos(angle) * LASER_SPEED,
            Math.sin(angle) * LASER_SPEED,
            4,
            player.id,
            LASER_RANGE,
            0.65,
            2,
            0.03,
            "laser",
          ),
        );
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
          player.worldX,
          player.worldY,
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
        state.entityManager.spawn(grenade);
        queuePlayerThrowSound(state, player);
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
        const canPlace = state.tiles.passable(targetX, targetY);
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
        state.entityManager.spawn(mine);
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

    const dx = target.worldX - monster.worldX;
    const dy = target.worldY - monster.worldY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    const equippedWeapon = equippedMonsterWeaponType(monster);
    const weapon = weaponOverride ?? equippedWeapon;
    if (
      isAdaptiveWeaponMonster(monster) &&
      weapon !== WeaponType.GRENADE &&
      weapon !== WeaponType.LAND_MINE &&
      weapon !== equippedWeapon
    ) {
      return;
    }

    const launchMonsterBullet = (
      aim: number,
      damage: number,
      speed: number,
      maxDistance: number,
    ): void => {
      const muzzleOffset = 16;
      state.entityManager.spawn(
        new BulletEntity(
          monster.worldX + Math.cos(aim) * muzzleOffset,
          monster.worldY + Math.sin(aim) * muzzleOffset,
          Math.cos(aim) * speed,
          Math.sin(aim) * speed,
          damage,
          monster.id,
          maxDistance,
        ),
      );
    };

    switch (weapon) {
      case WeaponType.GRENADE: {
        if (monster.grenades <= 0) return;

        const THROW_SPEED = 320;
        const leadTime = distance / THROW_SPEED;
        const targetVelocityX = target.velocityX ?? 0;
        const targetVelocityY = target.velocityY ?? 0;
        const predictedX = target.worldX + targetVelocityX * leadTime;
        const predictedY = target.worldY + targetVelocityY * leadTime;
        const angle = Math.atan2(
          predictedY - monster.worldY,
          predictedX - monster.worldX,
        );

        monster.grenades--;
        const grenade = new ExplosiveEntity(
          monster.worldX,
          monster.worldY,
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
        state.entityManager.spawn(grenade);
        return;
      }
      case WeaponType.LAND_MINE: {
        if (monster.landMines <= 0) return;
        monster.landMines--;
        const mine = new ExplosiveEntity(
          monster.worldX,
          monster.worldY,
          ItemType.LAND_MINE,
          true,
          undefined,
          monster.id,
          EXPLOSIVE_OWNER_GRACE_TICKS,
        );
        state.entityManager.spawn(mine);
        return;
      }
      case WeaponType.PISTOL: {
        if (monster.bullets <= 0) return;

        const baseAngle = Math.atan2(dy, dx);
        const variance = ((RNG.int(100) - 50) / 50) * SKULKER_SHOT_VARIANCE;
        const angle = baseAngle + variance;

        monster.bullets--;
        launchMonsterBullet(
          angle,
          1,
          SKULKER_BULLET_SPEED,
          SKULKER_SHOOT_MAX_RANGE_PX,
        );
        state.pendingSounds.push({
          effect: SoundEffect.SHOOT,
          worldX: monster.worldX,
          worldY: monster.worldY,
        });
        return;
      }
      case WeaponType.SMG: {
        if (monster.bullets <= 0) return;
        monster.bullets--;
        const angle = Math.atan2(dy, dx) + (RNG.int(11) - 5) * 0.012;
        launchMonsterBullet(angle, 2, 640, 560);
        const smgSounds = [SoundEffect.SMG_SHOOT_1, SoundEffect.SMG_SHOOT_2];
        state.pendingSounds.push({
          effect: smgSounds[RNG.int(smgSounds.length)],
          worldX: monster.worldX,
          worldY: monster.worldY,
        });
        return;
      }
      case WeaponType.SHOTGUN: {
        if (monster.bullets < MONSTER_SHOTGUN_AMMO_COST) return;
        monster.bullets -= MONSTER_SHOTGUN_AMMO_COST;
        const pellets = 6;
        const spread = 0.42;
        const baseAngle = Math.atan2(dy, dx);
        for (let i = 0; i < pellets; i++) {
          const offset = i / (pellets - 1) - 0.5;
          launchMonsterBullet(baseAngle + offset * spread, 2, 560, 360);
        }
        const shotgunSounds = [
          SoundEffect.SHOTGUN_BLAST_1,
          SoundEffect.SHOTGUN_BLAST_2,
          SoundEffect.SHOTGUN_BLAST_3,
        ];
        state.pendingSounds.push({
          effect: shotgunSounds[RNG.int(shotgunSounds.length)],
          worldX: monster.worldX,
          worldY: monster.worldY,
        });
        return;
      }
      case WeaponType.LASER: {
        if ((monster.laserCharge ?? 0) < MONSTER_LASER_SHOT_COST) return;
        monster.laserCharge =
          (monster.laserCharge ?? 0) - MONSTER_LASER_SHOT_COST;
        const angle = Math.atan2(dy, dx);
        const muzzleOffset = 16;
        const speed = 3600;
        state.entityManager.spawn(
          new BulletEntity(
            monster.worldX + Math.cos(angle) * muzzleOffset,
            monster.worldY + Math.sin(angle) * muzzleOffset,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            4,
            monster.id,
            1536,
            0.65,
            2,
            0.03,
            "laser",
          ),
        );
        const laserSounds = [
          SoundEffect.LASER_SHOOT_1,
          SoundEffect.LASER_SHOOT_2,
          SoundEffect.LASER_SHOOT_3,
          SoundEffect.LASER_SHOOT_4,
        ];
        state.pendingSounds.push({
          effect: laserSounds[RNG.int(laserSounds.length)],
          worldX: monster.worldX,
          worldY: monster.worldY,
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

/** Consume one of a counted item; clear the inventory slot when it hits zero. */
function consumeOne(player: Player, type: ItemType): void {
  const remaining = (player.itemCounts[type] ?? 0) - 1;
  if (remaining <= 0) {
    delete player.itemCounts[type];
    removeFromInventory(player, type);
  } else {
    player.itemCounts[type] = remaining;
  }
}

function msg(state: GameState, message: string, cause?: string): void {
  pushEvent(state, {
    type: EventType.MESSAGE,
    data: { type: "MESSAGE", message },
    cause,
  });
}

/**
 * Eating a cookie near a wild snagglepuss can win it over: it becomes a friendly
 * fetcher that gathers loose loot and brings it to you.
 */
function befriendNearbySnagglepuss(state: GameState, player: Player): void {
  const RANGE = CELL_CONFIG.w * 4;
  for (const entity of state.entities) {
    if (entity.kind !== EntityKind.MONSTER) continue;
    const monster = entity as Monster;
    if (monster.type !== MonsterType.SNAGGLEPUSS || monster.friendly) continue;
    const dx = (monster as unknown as Player).worldX - player.worldX;
    const dy = (monster as unknown as Player).worldY - player.worldY;
    if (dx * dx + dy * dy > RANGE * RANGE) continue;
    if (!RNG.chance(0.5)) continue;
    monster.friendly = true;
    monster.fleeing = false;
    monster.ownerId = player.id;
    monster.name = monster.name ?? "Snagglepuss";
    state.pendingSounds.push({
      effect: SoundEffect.SNAGGLEPUSS_ACK,
      worldX: monster.worldX,
      worldY: monster.worldY,
    });
    msg(
      state,
      "A snagglepuss creeps over for a crumb — and decides to tag along!",
    );
    return;
  }
}

/** Chebyshev reach check for the Matter Manipulator's mine/place actions. */
function withinManipulatorReach(
  player: Player,
  tileX: number,
  tileY: number,
): boolean {
  const dx = Math.abs(tileX - player.gridX);
  const dy = Math.abs(tileY - player.gridY);
  return Math.max(dx, dy) <= MATTER_MANIPULATOR_RANGE;
}

/**
 * Matter Manipulator — mine the targeted fixture or structure back into its
 * placeable item. Ground terrain is unaffected.
 */
function resolveMineCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;
  const player = actor as Player;
  if (cmd.data.type !== "MINE") return;
  if (!player.hasMatterManipulator) return;
  const { tileX, tileY } = cmd.data;

  if (
    !inBoundsFor(tileX, tileY, state.mapWidth, state.mapHeight) ||
    !withinManipulatorReach(player, tileX, tileY)
  ) {
    msg(state, "That's out of reach.");
    return;
  }

  const tile = state.tiles.getTile(tileX, tileY);
  const structure = state.worldPlane.layers.structure[
    state.worldPlane.indexFor(tileX, tileY)
  ] as StructureType;
  if (
    structure === StructureType.WORKSHOP ||
    structure === StructureType.WORKSHOP_FOOTPRINT
  ) {
    msg(state, "The workshop is a permanent part of the settlement.", cmd.id);
    return;
  }
  const dropped = minedItemForTile(tile);
  if (dropped === null) {
    msg(state, "There's nothing to mine there.");
    return;
  }

  const idx = idxFor(tileX, tileY, state.mapWidth);
  setStateTile(state, tileX, tileY, TileType.FLOOR);
  setStateDamageAtIndex(state, idx, 0);
  state.mapDirty = true;
  state.changedTiles?.add(idx);

  // The mined material drops in-place as a pickup — it is NOT auto-collected.
  if (typeof state.entityManager?.spawn === "function") {
    state.entityManager.spawn(new ItemEntity(tileX, tileY, dropped));
  }
  state.pendingSounds.push({ effect: SoundEffect.REPAIR });
  msg(state, `You mine loose a ${itemName(dropped)}.`, cmd.id);
}

/**
 * Matter Manipulator — place a wall block from the inventory on open ground.
 * Works on every level so the player can mix wall styles freely.
 */
function resolvePlaceBlockCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;
  const player = actor as Player;
  if (cmd.data.type !== "PLACE_BLOCK") return;
  if (!player.hasMatterManipulator) return;
  const { tileX, tileY, itemType } = cmd.data;

  const tileType = placedTileForItem(itemType);
  if (tileType === null) {
    msg(state, `You can't place the ${itemName(itemType)}.`);
    return;
  }
  if ((player.itemCounts[itemType] ?? 0) <= 0) {
    msg(state, `No ${itemName(itemType)} left to place.`);
    return;
  }
  if (
    !inBoundsFor(tileX, tileY, state.mapWidth, state.mapHeight) ||
    !withinManipulatorReach(player, tileX, tileY)
  ) {
    msg(state, "That's out of reach.");
    return;
  }

  // Only build on open, walkable ground — never overwrite walls, doors,
  // stairs, or holes.
  const existing = state.tiles.getTile(tileX, tileY);
  const buildable =
    tileIsPassable(existing) &&
    existing !== TileType.HOLE &&
    existing !== TileType.STAIRS_UP &&
    existing !== TileType.STAIRS_DOWN &&
    existing !== TileType.DOOR_OPEN;
  if (!buildable) {
    msg(state, "You can't build there.");
    return;
  }

  const occupied = state.entities.some(
    (e) =>
      (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER) &&
      e.gridX === tileX &&
      e.gridY === tileY,
  );
  if (occupied) {
    msg(state, "Something's in the way.");
    return;
  }

  const idx = idxFor(tileX, tileY, state.mapWidth);
  setStateTile(state, tileX, tileY, tileType);
  setStateDamageAtIndex(state, idx, 0);
  state.mapDirty = true;
  state.changedTiles?.add(idx);

  consumeOne(player, itemType);
  state.pendingSounds.push({ effect: SoundEffect.REPAIR });
  msg(state, `You place a ${itemName(itemType)}.`, cmd.id);
}

function resolveShapeTerrainCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((entity) => entity.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;
  const player = actor as Player;
  if (cmd.data.type !== "SHAPE_TERRAIN") return;
  if (!player.hasMatterManipulator) return;
  const { tileX, tileY, delta } = cmd.data;
  if (
    !state.worldPlane.inBounds(tileX, tileY) ||
    !withinManipulatorReach(player, tileX, tileY)
  ) {
    msg(state, "That's out of reach.");
    return;
  }
  const index = state.worldPlane.indexFor(tileX, tileY);
  const ground = state.worldPlane.layers.ground[index] as GroundType;
  const structure = state.worldPlane.layers.structure[index] as StructureType;
  const fixture = state.worldPlane.layers.fixture[index] as FixtureType;
  const shapeableGround =
    ground === GroundType.GRASS ||
    ground === GroundType.WEEDS ||
    ground === GroundType.DIRT ||
    ground === GroundType.STONE ||
    ground === GroundType.FLOOR;
  if (
    !shapeableGround ||
    structure !== StructureType.NONE ||
    fixture !== FixtureType.NONE
  ) {
    msg(state, "Clear this cell before shaping its terrain.");
    return;
  }
  const occupied = state.entities.some(
    (entity) =>
      (entity.kind === EntityKind.PLAYER ||
        entity.kind === EntityKind.MONSTER) &&
      entity.gridX === tileX &&
      entity.gridY === tileY,
  );
  if (occupied) {
    msg(state, "Something's in the way.");
    return;
  }

  const previous = state.worldPlane.layers.elevation[index];
  const next = previous + delta;
  if (next < MIN_EDITABLE_ELEVATION || next > MAX_EDITABLE_ELEVATION) {
    msg(
      state,
      `Terrain shaping is limited to ${MIN_EDITABLE_ELEVATION} through ${MAX_EDITABLE_ELEVATION}.`,
    );
    return;
  }
  editStateCell(state, tileX, tileY, { elevation: next });
  state.pendingSounds.push({ effect: SoundEffect.REPAIR });
  msg(
    state,
    `You ${delta > 0 ? "raise" : "lower"} the terrain to ${next}.`,
    cmd.id,
  );
}

/**
 * Left-click "use the active item". Weapons/grenades/mines/melee fall through to
 * the firing logic; consumables and gear have bespoke effects.
 */
function resolveUseItemCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;
  const player = actor as Player;
  const active = player.inventorySlots[player.selectedBarSlot]?.type ?? null;

  switch (active) {
    case ItemType.MEDKIT: {
      if ((player.itemCounts[ItemType.MEDKIT] ?? 0) <= 0) {
        msg(state, "No medkits left.");
        return;
      }
      if (player.hp >= player.hpMax) {
        msg(state, "You're already at full health.");
        return;
      }
      const heal = 15;
      player.hp = Math.min(player.hpMax, player.hp + heal);
      consumeOne(player, ItemType.MEDKIT);
      const healSounds = [SoundEffect.HEAL_1, SoundEffect.HEAL_2];
      state.pendingSounds.push({
        effect: healSounds[RNG.int(healSounds.length)],
      });
      msg(state, `You patch yourself up. +${heal} HP`, cmd.id);
      return;
    }
    case ItemType.COOKIE: {
      if ((player.itemCounts[ItemType.COOKIE] ?? 0) <= 0) {
        msg(state, "No cookies left.");
        return;
      }
      const heal = 6;
      player.hp = Math.min(player.hpMax, player.hp + heal);
      consumeOne(player, ItemType.COOKIE);
      const eatSounds = [SoundEffect.EAT_1, SoundEffect.EAT_2];
      state.pendingSounds.push({
        effect: eatSounds[RNG.int(eatSounds.length)],
      });
      msg(state, `You eat a cookie. +${heal} HP`, cmd.id);
      // The aroma can win over a nearby snagglepuss.
      befriendNearbySnagglepuss(state, player);
      return;
    }
    case ItemType.BLACK_PILL: {
      removeFromInventory(player, ItemType.BLACK_PILL);
      player.hp = 0;
      msg(state, "You swallow the black pill. Everything goes dark...", cmd.id);
      pushEvent(state, {
        type: EventType.PLAYER_DEATH,
        data: { type: "PLAYER_DEATH", playerId: player.id },
        cause: cmd.id,
      });
      return;
    }
    case ItemType.POWERCELL: {
      if ((player.itemCounts[ItemType.POWERCELL] ?? 0) <= 0) {
        msg(state, "No power cells left.");
        return;
      }
      consumeOne(player, ItemType.POWERCELL);
      // A cell is spent entirely to top off your energy gear.
      player.laserCharge = player.laserChargeMax;
      player.panicCharge = player.panicChargeMax;
      state.pendingSounds.push({ effect: SoundEffect.RECHARGE });
      msg(state, "Power cell spent — energy gear fully charged.", cmd.id);
      return;
    }
    case ItemType.BONE:
    case ItemType.ROCK: {
      if ((player.itemCounts[active] ?? 0) <= 0) {
        msg(state, "Nothing left to throw.");
        return;
      }
      const THROW_SPEED = 340;
      const MUZZLE = 16;
      const angle = player.facingAngle;
      const thrown = new BulletEntity(
        player.worldX + Math.cos(angle) * MUZZLE,
        player.worldY + Math.sin(angle) * MUZZLE,
        Math.cos(angle) * THROW_SPEED,
        Math.sin(angle) * THROW_SPEED,
        active === ItemType.ROCK ? 3 : 2, // rocks hit a little harder
        player.id,
        2000, // generous max range; friction stops it first
        6, // fuse seconds
        0, // no ricochet count; thrown items bounce in physics
      );
      thrown.thrownItem = active;
      state.entityManager.spawn(thrown);
      consumeOne(player, active);
      queuePlayerThrowSound(state, player);
      msg(
        state,
        `You hurl the ${active === ItemType.ROCK ? "rock" : "bone"}.`,
        cmd.id,
      );
      return;
    }
    case ItemType.HOLOWALL: {
      if ((player.itemCounts[ItemType.HOLOWALL] ?? 0) <= 0) {
        msg(state, "No holowalls left.");
        return;
      }
      const angle = player.facingAngle;
      const tx = player.gridX + Math.round(Math.cos(angle));
      const ty = player.gridY + Math.round(Math.sin(angle));
      if (!inBoundsFor(tx, ty, state.mapWidth, state.mapHeight)) {
        msg(state, "You can't place that there.");
        return;
      }
      if (state.tiles.getTile(tx, ty) !== TileType.FLOOR) {
        msg(state, "The holowall needs open floor.");
        return;
      }
      const occupied = state.entities.some(
        (e) =>
          (e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER) &&
          e.gridX === tx &&
          e.gridY === ty,
      );
      if (occupied) {
        msg(state, "Something's in the way.");
        return;
      }
      setStateTile(state, tx, ty, TileType.HOLOWALL);
      state.mapDirty = true;
      consumeOne(player, ItemType.HOLOWALL);
      state.pendingSounds.push({ effect: SoundEffect.PLACE_WALL });
      msg(state, "You deploy a holowall.", cmd.id);
      return;
    }
    case ItemType.PANIC_BUTTON: {
      if (player.panicCharge < player.panicChargeMax) {
        state.pendingSounds.push({
          effect: SoundEffect.CLICK,
          sourceId: player.id,
        });
        msg(
          state,
          "The panic button is still charging — feed it a power cell.",
        );
        return;
      }
      if (state.multiplayer?.mode === "online") {
        msg(state, "The teleporter sparks but co-op warp isn't wired yet.");
        return;
      }
      if (state.depth <= 0) {
        msg(state, "You're already at the surface.");
        return;
      }
      player.panicCharge = 0;
      state.shouldAscend = true; // warp one level toward the entrance
      state.pendingSounds.push({ effect: SoundEffect.PANIC_BUTTON });
      msg(state, "PANIC! The teleporter yanks you toward safety!", cmd.id);
      return;
    }
    default: {
      const category = active === null ? null : ITEM_DEFS[active]?.category;
      if (
        active !== null &&
        category !== "weapon-melee" &&
        category !== "weapon-ranged" &&
        category !== "throwable"
      ) {
        msg(state, `You can't attack with the ${itemName(active)}.`);
        return;
      }
      // Weapons, grenades, mines, melee, or empty hands → fire/attack.
      resolveFireCommand(state, {
        ...cmd,
        type: CommandType.FIRE,
        data: {
          type: "FIRE",
          dx: (cmd.data as { dx?: number }).dx ?? 0,
          dy: (cmd.data as { dy?: number }).dy ?? 0,
          weapon: weaponTypeForItem(active),
          targetWorldX: (cmd.data as { targetWorldX?: number }).targetWorldX,
          targetWorldY: (cmd.data as { targetWorldY?: number }).targetWorldY,
        },
      });
      return;
    }
  }
}

function resolveReloadCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  const active = player.inventorySlots[player.selectedBarSlot]?.type ?? null;

  // Laser pistol: reload with a power cell.
  if (active === ItemType.LASER_PISTOL || player.weapon === WeaponType.LASER) {
    if (player.laserCharge >= player.laserChargeMax) {
      msg(state, "Laser already fully charged.");
      return;
    }
    if ((player.itemCounts[ItemType.POWERCELL] ?? 0) <= 0) {
      maybeEmitPlayerWeaponCallout(
        state,
        player,
        WeaponType.LASER,
        "depleted",
        cmd.id,
      );
      msg(state, "No power cells to charge the laser.");
      return;
    }
    consumeOne(player, ItemType.POWERCELL);
    player.laserCharge = player.laserChargeMax;
    state.pendingSounds.push({ effect: SoundEffect.RELOAD });
    maybeEmitPlayerWeaponCallout(
      state,
      player,
      WeaponType.LASER,
      "reloaded",
      cmd.id,
    );
    return;
  }

  // Gyrojet firearms: refill the magazine from reserve ammo.
  const usesAmmo =
    player.weapon === WeaponType.PISTOL ||
    player.weapon === WeaponType.SMG ||
    player.weapon === WeaponType.SHOTGUN;
  if (!usesAmmo) {
    msg(state, "Nothing to reload.");
    return;
  }

  const magSize =
    player.weapon === WeaponType.SMG
      ? 30
      : player.weapon === WeaponType.SHOTGUN
        ? 8
        : 12;
  const needed = Math.max(0, magSize - player.ammo);
  if (needed === 0) {
    msg(state, "Magazine already full.");
    return;
  }
  if (player.ammoReserve <= 0) {
    maybeEmitPlayerWeaponCallout(
      state,
      player,
      player.weapon,
      "depleted",
      cmd.id,
    );
    msg(state, "You're out of ammo!");
    return;
  }
  const take = Math.min(needed, player.ammoReserve);
  player.ammo += take;
  player.ammoReserve -= take;

  state.pendingSounds.push({ effect: SoundEffect.RELOAD });
  maybeEmitPlayerWeaponCallout(
    state,
    player,
    player.weapon,
    "reloaded",
    cmd.id,
  );
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
    if (ITEM_DEFS[(e as Item).type]?.collectible === false) return false;

    // Use continuous coordinates if available
    if ("worldX" in actor && "worldX" in e) {
      const dx = e.worldX - actor.worldX;
      const dy = e.worldY - actor.worldY;
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
  const tile = state.tiles.getTile(data.x, data.y);

  if (tile === TileType.DOOR_CLOSED || tile === TileType.DOOR_OPEN) {
    // Toggle door open/closed
    pushEvent(state, {
      type: EventType.DOOR_OPEN,
      data: { type: "DOOR_OPEN", x: data.x, y: data.y },
    });
  } else if (tile === TileType.DOOR_LOCKED) {
    if (actor.kind === EntityKind.PLAYER && (actor as Player).keys > 0) {
      state.pendingSounds.push({
        effect: SoundEffect.DOOR_SCAN,
        worldX: data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2,
        worldY: data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2,
      });
      (actor as Player).keys--;
      state.pendingSounds.push({
        effect: SoundEffect.DOOR_UNLOCK,
        worldX: data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2,
        worldY: data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2,
      });
      pushEvent(state, {
        type: EventType.DOOR_OPEN,
        data: { type: "DOOR_OPEN", x: data.x, y: data.y },
      });
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "You unlock the door." },
      });
    } else {
      const doorFiddleSounds = [
        SoundEffect.DOOR_FIDDLE_1,
        SoundEffect.DOOR_FIDDLE_2,
      ];
      state.pendingSounds.push({
        effect: doorFiddleSounds[RNG.int(doorFiddleSounds.length)],
        worldX: data.x * CELL_CONFIG.w + CELL_CONFIG.w / 2,
        worldY: data.y * CELL_CONFIG.h + CELL_CONFIG.h / 2,
      });
      pushEvent(state, {
        type: EventType.MESSAGE,
        data: { type: "MESSAGE", message: "The door is locked." },
      });
    }
  }

  // Interacting toward a vending machine buys a random item for coins.
  if (actor.kind === EntityKind.PLAYER) {
    const machine = state.entities.find(
      (e) =>
        e.kind === EntityKind.ITEM &&
        (e as Item).type === ItemType.VENDING_MACHINE &&
        e.gridX === data.x &&
        e.gridY === data.y,
    );
    if (machine) buyFromVending(state, actor as Player);
  }
}

const VENDING_COST = 5;
const VENDING_STOCK: ItemType[] = [
  ItemType.AMMO,
  ItemType.MEDKIT,
  ItemType.GRENADE,
  ItemType.COOKIE,
  ItemType.POWERCELL,
  ItemType.KEYCARD,
  ItemType.ROCK,
];

/** Spend coins for a random item; the drop is auto-collected by the magnet. */
function buyFromVending(state: GameState, player: Player): void {
  const coins = player.itemCounts[ItemType.COIN] ?? 0;
  if (coins < VENDING_COST) {
    msg(state, `The vending machine wants ${VENDING_COST} coins.`);
    return;
  }
  const left = coins - VENDING_COST;
  if (left <= 0) {
    delete player.itemCounts[ItemType.COIN];
    removeFromInventory(player, ItemType.COIN);
  } else {
    player.itemCounts[ItemType.COIN] = left;
  }
  const type = VENDING_STOCK[RNG.int(VENDING_STOCK.length)];
  // Dispense at the player's feet; the magnetic pickup collects it next tick.
  const item = new ItemEntity(player.gridX, player.gridY, type);
  item.worldX = player.worldX;
  item.worldY = player.worldY;
  state.entityManager.spawn(item);
  msg(state, `The machine dispenses a ${itemName(type)}.`);
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
  const portal = portalAt(
    state.portals,
    { spaceId: state.worldSpaceId, planeId: state.worldPlaneId },
    player.gridX,
    player.gridY,
    ["stairs", "ladder", "cave-mouth", "door"],
  );
  if (!portal) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "No stairs here." },
    });
    return;
  }

  // Trigger level change (handled by Game.ts after tick completes)
  pushEvent(state, {
    type: EventType.MESSAGE,
    data: {
      type: "MESSAGE",
      message:
        portal.kind === "door"
          ? "You step through the doorway..."
          : portal.kind === "cave-mouth"
            ? "You enter the grotto..."
            : "You descend deeper...",
    },
  });

  // Set flag for Game.ts to handle
  state.descendTarget = undefined;
  state.pendingPortalId = portal.id;
  state.shouldDescend = true;
}

// ========================================
// Ascend Command
// ========================================

function resolveAscendCommand(state: GameState, cmd: Command): void {
  const actor = state.entities.find((e) => e.id === cmd.actorId);
  if (!actor || actor.kind !== EntityKind.PLAYER) return;

  const player = actor as Player;
  const portal = portalAt(
    state.portals,
    { spaceId: state.worldSpaceId, planeId: state.worldPlaneId },
    player.gridX,
    player.gridY,
    ["stairs", "ladder", "cave-mouth", "door"],
  );
  if (!portal) {
    pushEvent(state, {
      type: EventType.MESSAGE,
      data: { type: "MESSAGE", message: "No stairs here." },
    });
    return;
  }

  pushEvent(state, {
    type: EventType.MESSAGE,
    data: {
      type: "MESSAGE",
      message:
        portal.kind === "door"
          ? "You step back through the doorway..."
          : portal.kind === "cave-mouth"
            ? "You climb toward daylight..."
            : "You ascend...",
    },
  });

  state.pendingPortalId = portal.id;
  state.shouldAscend = true;
}
