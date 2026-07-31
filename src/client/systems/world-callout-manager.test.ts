/** Tests for client-only callout deduplication, queues, and wall-clock timing. */

import { describe, expect, it } from "vitest";
import { WorldCallout } from "../../engine/types";
import { WorldCalloutManager } from "./world-callout-manager";

function speech(
  id: string,
  speakerId: string,
  text: string = "Hello",
): WorldCallout {
  return {
    id,
    kind: "speech",
    speakerId,
    text,
    worldX: 10,
    worldY: 20,
    priority: "normal",
  };
}

describe("WorldCalloutManager", () => {
  it("deduplicates retransmitted snapshot callouts", () => {
    const manager = new WorldCalloutManager();
    const callout = speech("one", "speaker");

    expect(manager.ingest([callout], 100)).toEqual([callout]);
    expect(manager.ingest([callout], 150)).toEqual([]);
    expect(manager.getActive(200)).toHaveLength(1);
  });

  it("queues lines from the same speaker instead of replacing them", () => {
    const manager = new WorldCalloutManager();
    manager.ingest(
      [speech("one", "speaker", "First"), speech("two", "speaker", "Second")],
      0,
    );

    expect(manager.getActive(100)[0].callout.id).toBe("one");
    expect(manager.getActive(5_100)[0].callout.id).toBe("two");
  });

  it("uses wall-clock durations and clears on world changes", () => {
    const manager = new WorldCalloutManager();
    manager.setWorld("earth", "outside");
    manager.ingest([speech("one", "speaker")], 0);

    expect(manager.getActive(1_000)[0].opacity).toBeGreaterThan(0.9);
    manager.setWorld("megacorp", "floor-1");
    expect(manager.getActive(1_000)).toEqual([]);
  });
});
