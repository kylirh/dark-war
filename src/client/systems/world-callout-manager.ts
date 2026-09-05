/**
 * Owns client-side callout lifetime, deduplication, and per-speaker queues.
 * Wall-clock timing keeps bubbles readable during CTDM and simulation pauses.
 */

import { WorldCallout, WorldCalloutPriority } from "../../engine/types";

const MAX_ACTIVE_CALLOUTS = 6;
const MAX_QUEUED_PER_ANCHOR = 2;
const SEEN_ID_RETENTION_MS = 30_000;

interface ActiveCallout {
  callout: WorldCallout;
  startedAtMs: number;
  durationMs: number;
}

export interface WorldCalloutView {
  callout: WorldCallout;
  ageMs: number;
  durationMs: number;
  opacity: number;
  scale: number;
}

/** Manages ephemeral callouts independently of authoritative game state. */
export class WorldCalloutManager {
  private readonly activeByAnchor = new Map<string, ActiveCallout>();
  private readonly queuedByAnchor = new Map<string, WorldCallout[]>();
  private readonly seenAtMs = new Map<string, number>();
  private worldKey?: string;

  /** Clears stale callouts when the local view changes world planes. */
  public setWorld(worldSpaceId: string, worldPlaneId: string): void {
    const nextWorldKey = `${worldSpaceId}:${worldPlaneId}`;
    if (this.worldKey === undefined) {
      this.worldKey = nextWorldKey;
      return;
    }
    if (this.worldKey !== nextWorldKey) {
      this.clear();
      this.worldKey = nextWorldKey;
    }
  }

  /** Accepts new callouts once, preserving order for the same speaker. */
  public ingest(
    callouts: readonly WorldCallout[],
    nowMs: number,
  ): WorldCallout[] {
    const accepted: WorldCallout[] = [];
    this.pruneSeen(nowMs);
    for (const callout of callouts) {
      if (this.seenAtMs.has(callout.id)) continue;
      this.seenAtMs.set(callout.id, nowMs);
      const anchorKey = anchorKeyFor(callout);
      const active = this.activeByAnchor.get(anchorKey);
      const queue = this.queuedByAnchor.get(anchorKey) ?? [];
      if (isDuplicateText(callout, active, queue)) continue;

      accepted.push(callout);
      if (!active && this.activeByAnchor.size < MAX_ACTIVE_CALLOUTS) {
        this.activeByAnchor.set(anchorKey, createActive(callout, nowMs));
        continue;
      }

      queue.push(callout);
      queue.sort(
        (left, right) =>
          priorityRank(right.priority) - priorityRank(left.priority),
      );
      if (queue.length > MAX_QUEUED_PER_ANCHOR) queue.length = 2;
      this.queuedByAnchor.set(anchorKey, queue);
    }
    return accepted;
  }

  /** Advances lifetimes and returns presentation-ready callouts. */
  public getActive(nowMs: number): WorldCalloutView[] {
    for (const [anchorKey, active] of this.activeByAnchor) {
      if (nowMs - active.startedAtMs < active.durationMs) continue;
      this.activeByAnchor.delete(anchorKey);
      this.promote(anchorKey, nowMs);
    }

    if (this.activeByAnchor.size < MAX_ACTIVE_CALLOUTS) {
      for (const anchorKey of this.queuedByAnchor.keys()) {
        if (this.activeByAnchor.size >= MAX_ACTIVE_CALLOUTS) break;
        if (!this.activeByAnchor.has(anchorKey)) this.promote(anchorKey, nowMs);
      }
    }

    return Array.from(this.activeByAnchor.values()).map((active) => {
      const ageMs = Math.max(0, nowMs - active.startedAtMs);
      const remainingMs = active.durationMs - ageMs;
      const fadeIn = Math.min(1, ageMs / 120);
      const fadeOut = Math.min(1, Math.max(0, remainingMs) / 220);
      const entrance = 1 - Math.pow(1 - Math.min(1, ageMs / 180), 3);
      return {
        callout: active.callout,
        ageMs,
        durationMs: active.durationMs,
        opacity: Math.min(fadeIn, fadeOut),
        scale: 0.86 + entrance * 0.14,
      };
    });
  }

  /** Removes all currently displayed and queued callouts. */
  public clear(): void {
    this.activeByAnchor.clear();
    this.queuedByAnchor.clear();
  }

  private promote(anchorKey: string, nowMs: number): void {
    const queue = this.queuedByAnchor.get(anchorKey);
    const next = queue?.shift();
    if (!next) {
      this.queuedByAnchor.delete(anchorKey);
      return;
    }
    if (queue?.length === 0) this.queuedByAnchor.delete(anchorKey);
    this.activeByAnchor.set(anchorKey, createActive(next, nowMs));
  }

  private pruneSeen(nowMs: number): void {
    for (const [id, seenAtMs] of this.seenAtMs) {
      if (nowMs - seenAtMs > SEEN_ID_RETENTION_MS) this.seenAtMs.delete(id);
    }
  }
}

function anchorKeyFor(callout: WorldCallout): string {
  return callout.speakerId ?? `point:${callout.id}`;
}

function isDuplicateText(
  callout: WorldCallout,
  active: ActiveCallout | undefined,
  queue: readonly WorldCallout[],
): boolean {
  if (callout.kind === "reaction") return false;
  if (
    active &&
    active.callout.kind !== "reaction" &&
    active.callout.text === callout.text
  ) {
    return true;
  }

  const latestQueued = queue.at(-1);
  return (
    latestQueued?.kind !== "reaction" && latestQueued?.text === callout.text
  );
}

function createActive(
  callout: WorldCallout,
  startedAtMs: number,
): ActiveCallout {
  return {
    callout,
    startedAtMs,
    durationMs: durationFor(callout),
  };
}

function durationFor(callout: WorldCallout): number {
  if (callout.kind === "reaction") return 1_250;
  const length = Array.from(callout.text).length;
  const baseMs = callout.kind === "thought" ? 2_100 : 1_700;
  return Math.min(5_000, Math.max(2_000, baseMs + length * 38));
}

function priorityRank(priority: WorldCalloutPriority): number {
  if (priority === "urgent") return 2;
  if (priority === "normal") return 1;
  return 0;
}
