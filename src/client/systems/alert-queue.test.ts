/** Tests for alert duration, ordering, and maximum-count behavior. */

import { describe, expect, it } from "vitest";
import {
  AlertQueue,
  DEFAULT_ALERT_DURATION_MS,
  MAX_ALERT_MESSAGES,
} from "./alert-queue";

describe("AlertQueue", () => {
  it("uses a five-second default and preserves custom durations", () => {
    const queue = new AlertQueue();

    const defaultAlert = queue.enqueue("default", 100);
    const customAlert = queue.enqueue("custom", 200, 1_250);

    expect(defaultAlert?.added.durationMs).toBe(DEFAULT_ALERT_DURATION_MS);
    expect(customAlert?.added.durationMs).toBe(1_250);
  });

  it("keeps oldest-to-newest order and evicts the oldest at six messages", () => {
    const queue = new AlertQueue();
    for (let i = 0; i < MAX_ALERT_MESSAGES; i++) {
      queue.enqueue(`message ${i}`, i);
    }

    const result = queue.enqueue("newest", 100);

    expect(result?.evicted?.text).toBe("message 0");
    expect(queue.getMessages().map((message) => message.text)).toEqual([
      "message 1",
      "message 2",
      "message 3",
      "message 4",
      "message 5",
      "newest",
    ]);
  });

  it("refreshes the newest alert instead of adding a duplicate", () => {
    const queue = new AlertQueue();

    const first = queue.enqueue("same message", 100, 500);
    const repeated = queue.enqueue("same message", 200, 1_000);

    expect(repeated?.repeated).toBe(true);
    expect(repeated?.added.id).toBe(first?.added.id);
    expect(repeated?.added.startedAtMs).toBe(200);
    expect(repeated?.added.durationMs).toBe(1_000);
    expect(queue.getMessages()).toHaveLength(1);
  });

  it("expires alerts using wall-clock time", () => {
    const queue = new AlertQueue();
    queue.enqueue("short", 1_000, 500);
    queue.enqueue("long", 1_000, 1_000);

    expect(queue.expire(1_499).map((message) => message.text)).toEqual([]);
    expect(queue.expire(1_500).map((message) => message.text)).toEqual([
      "short",
    ]);
    expect(queue.expire(2_000).map((message) => message.text)).toEqual([
      "long",
    ]);
  });
});
