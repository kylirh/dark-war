/**
 * Presents short, ephemeral alerts in the lower-left game HUD.
 *
 * Alerts are intentionally DOM-based so they stay crisp above the Pixi canvas
 * and can pass all pointer input through to the game beneath them.
 */

import { AlertQueue, DEFAULT_ALERT_DURATION_MS } from "./alert-queue";

const ALERT_FADE_DURATION_MS = 350;

interface AlertElementRecord {
  element: HTMLElement;
  dismissTimer: number;
  removalTimer?: number;
}

/** Owns alert elements, timers, and the queue's fade-out lifecycle. */
export class AlertManager {
  private readonly queue = new AlertQueue();
  private readonly elements = new Map<number, AlertElementRecord>();

  public constructor(private readonly container: HTMLElement) {}

  /** Show an alert for the supplied duration, defaulting to five seconds. */
  public show(
    text: string,
    durationMs: number = DEFAULT_ALERT_DURATION_MS,
  ): void {
    const result = this.queue.enqueue(text, performance.now(), durationMs);
    if (!result) return;

    if (result.evicted) {
      this.dismiss(result.evicted.id);
    }

    if (result.repeated) {
      const record = this.elements.get(result.added.id);
      if (record) {
        window.clearTimeout(record.dismissTimer);
        record.dismissTimer = window.setTimeout(
          () => this.dismiss(result.added.id),
          result.added.durationMs,
        );
      }
      return;
    }

    const element = document.createElement("div");
    element.className = "alert-message";
    element.textContent = result.added.text;
    this.container.appendChild(element);

    const dismissTimer = window.setTimeout(
      () => this.dismiss(result.added.id),
      result.added.durationMs,
    );
    this.elements.set(result.added.id, { element, dismissTimer });
  }

  /** Fade all visible alerts away and cancel their lifetime timers. */
  public clear(): void {
    for (const id of this.elements.keys()) {
      this.dismiss(id);
    }
    this.queue.clear();
  }

  /** Remove all alert elements and timers when the game instance is disposed. */
  public dispose(): void {
    for (const record of this.elements.values()) {
      window.clearTimeout(record.dismissTimer);
      if (record.removalTimer !== undefined) {
        window.clearTimeout(record.removalTimer);
      }
      record.element.remove();
    }
    this.elements.clear();
    this.queue.clear();
  }

  private dismiss(id: number): void {
    const record = this.elements.get(id);
    if (!record) return;
    if (record.element.classList.contains("alert-message-dismissing")) return;

    this.queue.remove(id);

    window.clearTimeout(record.dismissTimer);
    record.element.classList.add("alert-message-dismissing");
    record.removalTimer = window.setTimeout(() => {
      record.element.remove();
      this.elements.delete(id);
    }, ALERT_FADE_DURATION_MS);
  }
}
