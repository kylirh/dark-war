/**
 * Small, deterministic queue for ephemeral player-facing alert messages.
 *
 * The DOM lifecycle belongs to the client alert manager; this class keeps the
 * ordering, duration, and maximum-count rules easy to test independently.
 */

export const DEFAULT_ALERT_DURATION_MS = 5_000;
export const MAX_ALERT_MESSAGES = 6;

export interface AlertMessage {
  id: number;
  text: string;
  startedAtMs: number;
  durationMs: number;
}

export interface AlertEnqueueResult {
  added: AlertMessage;
  evicted?: AlertMessage;
}

/** Stores active alerts from oldest to newest. */
export class AlertQueue {
  private readonly messages: AlertMessage[] = [];
  private nextId = 1;

  /** Add an alert, evicting the oldest active alert when the queue is full. */
  public enqueue(
    text: string,
    startedAtMs: number,
    durationMs: number = DEFAULT_ALERT_DURATION_MS,
  ): AlertEnqueueResult | null {
    const normalizedText = text.trim();
    if (!normalizedText) return null;

    const added: AlertMessage = {
      id: this.nextId++,
      text: normalizedText,
      startedAtMs,
      durationMs: normalizeDuration(durationMs),
    };
    const evicted =
      this.messages.length >= MAX_ALERT_MESSAGES
        ? this.messages.shift()
        : undefined;
    this.messages.push(added);
    return { added, evicted };
  }

  /** Remove one alert immediately from the active queue. */
  public remove(id: number): AlertMessage | undefined {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index < 0) return undefined;
    return this.messages.splice(index, 1)[0];
  }

  /** Remove and return all alerts whose wall-clock duration has elapsed. */
  public expire(nowMs: number): AlertMessage[] {
    const expired: AlertMessage[] = [];
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (nowMs < message.startedAtMs + message.durationMs) continue;
      expired.unshift(...this.messages.splice(i, 1));
    }
    return expired;
  }

  /** Remove and return every currently active alert. */
  public clear(): AlertMessage[] {
    return this.messages.splice(0, this.messages.length);
  }

  /** Snapshot the current oldest-to-newest order. */
  public getMessages(): readonly AlertMessage[] {
    return [...this.messages];
  }
}

function normalizeDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return DEFAULT_ALERT_DURATION_MS;
  }
  return durationMs;
}
