/**
 * Pixi presentation for short world-anchored speech, thoughts, and semantic
 * reactions. Layout stays in world-view coordinates above the entity layer.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { WorldCallout } from "../../engine/types";
import { WorldCalloutView } from "./world-callout-manager";

const MAX_TEXT_WIDTH = 136;
const VIEW_EDGE_PADDING = 8;
const CALLOUT_GAP = 5;

export interface AnchoredWorldCallout extends WorldCalloutView {
  anchorX: number;
  anchorY: number;
}

interface LayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

class SpatialGrid {
  private readonly cellSize = 128;
  private readonly buckets = new Map<string, LayoutRect[]>();

  public insert(rect: LayoutRect): void {
    const minX = Math.floor(rect.left / this.cellSize);
    const maxX = Math.floor(rect.right / this.cellSize);
    const minY = Math.floor(rect.top / this.cellSize);
    const maxY = Math.floor(rect.bottom / this.cellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(rect);
      }
    }
  }

  public findOverlap(rect: LayoutRect): LayoutRect | undefined {
    const minX = Math.floor(rect.left / this.cellSize);
    const maxX = Math.floor(rect.right / this.cellSize);
    const minY = Math.floor(rect.top / this.cellSize);
    const maxY = Math.floor(rect.bottom / this.cellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const bucket = this.buckets.get(key);
        if (bucket) {
          const match = bucket.find((other) => overlaps(rect, other));
          if (match) return match;
        }
      }
    }
    return undefined;
  }
}

/** Draws active world callouts with compact, collision-aware placement. */
export class WorldCalloutLayer {
  public constructor(private readonly container: Container) {}

  public render(
    callouts: readonly AnchoredWorldCallout[],
    viewWidth: number,
    viewHeight: number,
  ): void {
    const children = this.container.removeChildren();
    for (const child of children) child.destroy({ children: true });

    const grid = new SpatialGrid();
    let occupiedCount = 0;
    const ordered = [...callouts].sort(
      (left, right) => priorityRank(right.callout) - priorityRank(left.callout),
    );
    for (const callout of ordered) {
      const display = this.createDisplay(callout);
      const bounds = display.getLocalBounds();
      let left = clamp(
        Math.round(callout.anchorX - bounds.width / 2),
        VIEW_EDGE_PADDING,
        Math.max(
          VIEW_EDGE_PADDING,
          viewWidth - bounds.width - VIEW_EDGE_PADDING,
        ),
      );
      let top = Math.round(callout.anchorY - bounds.height - 18);
      let rect = rectAt(left, top, bounds.width, bounds.height);

      for (let attempt = 0; attempt < occupiedCount + 2; attempt++) {
        const collision = grid.findOverlap(rect);
        if (!collision) break;
        top = collision.top - bounds.height - CALLOUT_GAP;
        rect = rectAt(left, top, bounds.width, bounds.height);
      }

      if (top < VIEW_EDGE_PADDING) {
        top = Math.min(
          viewHeight - bounds.height - VIEW_EDGE_PADDING,
          callout.anchorY + 18,
        );
        rect = rectAt(left, top, bounds.width, bounds.height);
      }

      display.position.set(left + bounds.width / 2, top + bounds.height / 2);
      display.alpha = callout.opacity;
      display.scale.set(callout.scale);
      display.pivot.set(bounds.width / 2, bounds.height / 2);
      this.container.addChild(display);
      grid.insert(rect);
      occupiedCount++;
    }
  }

  private createDisplay(callout: AnchoredWorldCallout): Container {
    if (callout.callout.kind === "reaction") {
      return createReactionDisplay(callout.callout);
    }
    return createTextDisplay(callout.callout);
  }
}

function createTextDisplay(
  callout: Extract<WorldCallout, { kind: "speech" | "thought" }>,
): Container {
  const root = new Container();
  const text = new Text({
    text: callout.text,
    style: new TextStyle({
      fontFamily: "Chicago_12, Chicago, monospace",
      fontSize: 12,
      fontWeight: "bold",
      fill: callout.kind === "thought" ? 0x4d3e73 : 0x3b365d,
      align: "center",
      lineHeight: 15,
      wordWrap: true,
      breakWords: true,
      wordWrapWidth: MAX_TEXT_WIDTH,
    }),
  });
  const horizontalPadding = 9;
  const verticalPadding = 6;
  const width = Math.max(36, Math.ceil(text.width) + horizontalPadding * 2);
  const height = Math.max(26, Math.ceil(text.height) + verticalPadding * 2);
  const background = new Graphics();

  if (callout.kind === "thought") {
    drawThoughtBubble(background, width, height);
  } else {
    drawSpeechBubble(background, width, height);
  }
  text.position.set(
    Math.round((width - text.width) / 2),
    Math.round((height - text.height) / 2) - 1,
  );
  root.addChild(background, text);
  return root;
}

function drawSpeechBubble(
  graphics: Graphics,
  width: number,
  height: number,
): void {
  graphics
    .roundRect(2, 3, width, height, 7)
    .fill({ color: 0x4d3e73, alpha: 0.45 });
  graphics
    .poly([
      width * 0.48 + 2,
      height + 2,
      width * 0.62 + 2,
      height + 2,
      width * 0.55 + 2,
      height + 10,
    ])
    .fill({ color: 0x4d3e73, alpha: 0.45 });
  graphics.roundRect(0, 0, width, height, 7).fill({ color: 0xfff0bd });
  graphics
    .poly([
      width * 0.48,
      height - 1,
      width * 0.62,
      height - 1,
      width * 0.55,
      height + 8,
    ])
    .fill({ color: 0xfff0bd });
}

function drawThoughtBubble(
  graphics: Graphics,
  width: number,
  height: number,
): void {
  graphics
    .roundRect(2, 3, width, height, 12)
    .fill({ color: 0x4d3e73, alpha: 0.4 });
  graphics.roundRect(0, 0, width, height, 12).fill({ color: 0xeee4ff });
  graphics.circle(width * 0.58 + 2, height + 6, 4).fill({ color: 0xeee4ff });
  graphics.circle(width * 0.64 + 2, height + 13, 2.5).fill({ color: 0xeee4ff });
}

function createReactionDisplay(
  callout: Extract<WorldCallout, { kind: "reaction" }>,
): Container {
  const root = new Container();
  const treatment = reactionTreatment(callout.reactionId);
  const text = new Text({
    text: treatment.text,
    style: new TextStyle({
      fontFamily: "Chicago_12, Chicago, monospace",
      fontSize: treatment.fontSize,
      fontWeight: "bold",
      fill: treatment.textColor,
      align: "center",
    }),
  });
  const width = Math.max(52, Math.ceil(text.width) + 20);
  const height = Math.max(38, Math.ceil(text.height) + 16);
  const burst = new Graphics();
  burst
    .poly(
      starburstPoints(width / 2 + 2, height / 2 + 3, width / 2, height / 2, 10),
    )
    .fill({ color: 0x4d3e73, alpha: 0.45 });
  burst
    .poly(starburstPoints(width / 2, height / 2, width / 2, height / 2, 10))
    .fill({ color: treatment.backgroundColor });
  text.position.set(
    Math.round((width - text.width) / 2),
    Math.round((height - text.height) / 2) - 1,
  );
  text.rotation = treatment.rotation;
  root.addChild(burst, text);
  return root;
}

function reactionTreatment(reactionId: string): {
  text: string;
  textColor: number;
  backgroundColor: number;
  fontSize: number;
  rotation: number;
} {
  switch (reactionId) {
    case "pow":
      return {
        text: "POW!",
        textColor: 0xd9485f,
        backgroundColor: 0xffda66,
        fontSize: 17,
        rotation: -0.06,
      };
    case "gasp":
      return {
        text: "GASP!",
        textColor: 0x6a4fa3,
        backgroundColor: 0xffa6a1,
        fontSize: 15,
        rotation: 0.04,
      };
    case "heart":
      return {
        text: "♥",
        textColor: 0xd9485f,
        backgroundColor: 0xffe1de,
        fontSize: 21,
        rotation: -0.04,
      };
    default:
      return {
        text: "?!",
        textColor: 0x4d3e73,
        backgroundColor: 0x9ff0dc,
        fontSize: 19,
        rotation: 0.05,
      };
  }
}

function starburstPoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  spikes: number,
): number[] {
  const points: number[] = [];
  for (let index = 0; index < spikes * 2; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / spikes;
    const radius = index % 2 === 0 ? 1 : 0.72;
    points.push(
      centerX + Math.cos(angle) * radiusX * radius,
      centerY + Math.sin(angle) * radiusY * radius,
    );
  }
  return points;
}

function priorityRank(callout: WorldCallout): number {
  if (callout.priority === "urgent") return 2;
  if (callout.priority === "normal") return 1;
  return 0;
}

function rectAt(
  left: number,
  top: number,
  width: number,
  height: number,
): LayoutRect {
  return { left, top, right: left + width, bottom: top + height };
}

function overlaps(left: LayoutRect, right: LayoutRect): boolean {
  return !(
    left.right + CALLOUT_GAP <= right.left ||
    left.left >= right.right + CALLOUT_GAP ||
    left.bottom + CALLOUT_GAP <= right.top ||
    left.top >= right.bottom + CALLOUT_GAP
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
