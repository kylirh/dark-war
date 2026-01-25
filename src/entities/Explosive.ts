import { EntityKind, ItemType } from "../types";
import { ContinuousEntity } from "./ContinuousEntity";

export class ExplosiveEntity extends ContinuousEntity {
  public readonly kind = EntityKind.EXPLOSIVE;
  public type: ItemType.GRENADE | ItemType.LAND_MINE;
  public armed: boolean;
  public fuseTicks?: number;

  constructor(
    worldX: number,
    worldY: number,
    type: ItemType.GRENADE | ItemType.LAND_MINE,
    armed: boolean,
    fuseTicks?: number,
  ) {
    super(0, 0);
    this.worldX = worldX;
    this.worldY = worldY;
    this.prevWorldX = worldX;
    this.prevWorldY = worldY;
    this.type = type;
    this.armed = armed;
    this.fuseTicks = fuseTicks;
  }
}

export function createExplosive(
  worldX: number,
  worldY: number,
  type: ItemType.GRENADE | ItemType.LAND_MINE,
  armed: boolean,
  fuseTicks?: number,
): ExplosiveEntity {
  return new ExplosiveEntity(worldX, worldY, type, armed, fuseTicks);
}
