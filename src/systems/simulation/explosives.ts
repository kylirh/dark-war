import {
  GameState,
  EntityKind,
  ItemType,
  EventType,
  CELL_CONFIG,
} from "../../types";
import { ExplosiveEntity } from "../../entities/explosive-entity";
import { applyWallDamageAt } from "../../utils/walls";
import { RNG } from "../../utils/rng";
import {
  SIM_DT_MS,
  EXPLOSIVE_CONFIG,
  LANDED_GRENADE_BOUNCE_SPEED,
  LANDED_GRENADE_MAX_OFFSET,
} from "./constants";
import { pushEvent } from "./sim-helpers";

export function triggerExplosion(
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

export function updateExplosives(state: GameState): void {
  const explosives: ExplosiveEntity[] = [];
  const actors = state.entities.filter(
    (e) => e.kind === EntityKind.PLAYER || e.kind === EntityKind.MONSTER,
  );
  for (const e of state.entities) {
    if (e.kind === EntityKind.EXPLOSIVE && e instanceof ExplosiveEntity) {
      explosives.push(e);
    }
  }

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
        state.entityManager.destroy(explosive.id);
        continue;
      }

      if (explosive.hasLanded) {
        updateLandedGrenadeBounce(explosive);
      }
    }

    if (explosive.type === ItemType.LAND_MINE) {
      const triggerRadiusSq = (CELL_CONFIG.w * 0.45) ** 2;
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
        return dx * dx + dy * dy <= triggerRadiusSq;
      });

      if (triggered) {
        triggerExplosion(
          state,
          explosive.worldX,
          explosive.worldY,
          explosive.type,
        );
        state.entityManager.destroy(explosive.id);
      }
    }
  }
}

export function updateLandedGrenadeBounce(explosive: ExplosiveEntity): void {
  if (
    typeof explosive.landingWorldX !== "number" ||
    typeof explosive.landingWorldY !== "number"
  ) {
    return;
  }

  const speed = Math.sqrt(
    explosive.velocityX * explosive.velocityX +
      explosive.velocityY * explosive.velocityY,
  );
  if (speed > 10) return;

  if (explosive.landingBounceCooldownTicks > 0) {
    explosive.landingBounceCooldownTicks--;
    return;
  }

  const dx = explosive.worldX - explosive.landingWorldX;
  const dy = explosive.worldY - explosive.landingWorldY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  let angle: number;

  if (distance > LANDED_GRENADE_MAX_OFFSET) {
    angle = Math.atan2(-dy, -dx);
  } else {
    angle = (RNG.int(360) / 180) * Math.PI;
  }

  const speedScale = 0.55 + RNG.int(46) / 100;
  explosive.velocityX =
    Math.cos(angle) * LANDED_GRENADE_BOUNCE_SPEED * speedScale;
  explosive.velocityY =
    Math.sin(angle) * LANDED_GRENADE_BOUNCE_SPEED * speedScale;
  explosive.landingBounceCooldownTicks = 1 + RNG.int(3);
}

export function updateEffects(state: GameState): void {
  const dt = SIM_DT_MS / 1000;
  let writeIdx = 0;
  for (let i = 0; i < state.effects.length; i++) {
    const effect = state.effects[i];
    effect.ageTicks++;
    if (effect.type === "spark") {
      effect.worldX += (effect.velocityX ?? 0) * dt;
      effect.worldY += (effect.velocityY ?? 0) * dt;
    }
    if (effect.ageTicks < effect.durationTicks) {
      state.effects[writeIdx++] = effect;
    }
  }
  state.effects.length = writeIdx;
}
