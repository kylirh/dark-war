/**
 * Error-handling coverage for the save-slot storage layer.
 *
 * Every read path is expected to degrade to "no save" rather than throw:
 * a save file is untrusted input (hand-edited, truncated, written by an older
 * build), and a throw here surfaces as a crash on the load screen. These tests
 * exercise the localStorage fallback, which is what the web client uses and
 * what the Electron client falls back to when the native bridge is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  readSaveSlot,
  writeSaveSlot,
  listSaveSlots,
  deleteSaveSlot,
  isSafeImageDataUrl,
  SAVE_SLOT_COUNT,
} from "./save-slots";

/** A record that parseSaveRecord accepts: version 1 with a state payload. */
function validRecordJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    slot: 0,
    characterName: "Captain Hazard",
    savedAt: "2026-01-01T00:00:00.000Z",
    region: "Megacorp Exterior",
    screenshotDataUrl: null,
    state: { depth: 0, levelKind: "outside" },
    ...overrides,
  });
}

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  // No native bridge: exercise the localStorage path.
  vi.stubGlobal("window", { native: undefined });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("readSaveSlot", () => {
  it("returns null when localStorage throws", async () => {
    // Private browsing and quota-exceeded states make getItem throw outright.
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Disk error");
    });
    await expect(readSaveSlot(0)).resolves.toBeNull();
  });

  it("returns null for an empty slot", async () => {
    await expect(readSaveSlot(0)).resolves.toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", async () => {
    store.set("darkwar-save-slot-1", "{not json");
    await expect(readSaveSlot(0)).resolves.toBeNull();
  });

  it("returns null for a record from an unknown version", async () => {
    store.set("darkwar-save-slot-1", validRecordJson({ version: 99 }));
    await expect(readSaveSlot(0)).resolves.toBeNull();
  });

  it("returns null for a record with no state payload", async () => {
    store.set("darkwar-save-slot-1", validRecordJson({ state: undefined }));
    await expect(readSaveSlot(0)).resolves.toBeNull();
  });

  it("round-trips a valid record", async () => {
    store.set("darkwar-save-slot-1", validRecordJson());
    const record = await readSaveSlot(0);
    expect(record).not.toBeNull();
    expect(record?.slot).toBe(0);
    expect(record?.characterName).toBe("Captain Hazard");
  });

  it("falls back to the requested slot when the record's slot is out of range", async () => {
    store.set("darkwar-save-slot-3", validRecordJson({ slot: 999 }));
    const record = await readSaveSlot(2);
    expect(record?.slot).toBe(2);
  });

  it("falls back to defaults if fields are not strings", async () => {
    store.set(
      "darkwar-save-slot-1",
      JSON.stringify({ version: 1, state: { depth: 0 }, characterName: 123, region: ["not a string"], savedAt: {} }),
    );
    const record = await readSaveSlot(0);
    expect(record?.characterName).toBe("Captain Hazard");
    expect(record?.region).toBe("Unknown Region");
    expect(record?.savedAt).toBe(new Date(0).toISOString());
  });

  it("backfills missing optional fields with defaults", async () => {
    store.set(
      "darkwar-save-slot-1",
      JSON.stringify({ version: 1, state: { depth: 0 } }),
    );
    const record = await readSaveSlot(0);
    expect(record?.characterName).toBe("Captain Hazard");
    expect(record?.region).toBe("Unknown Region");
    expect(record?.screenshotDataUrl).toBeNull();
  });
});

describe("slot validation", () => {
  it("rejects out-of-range and non-integer slots on every entry point", async () => {
    for (const slot of [-1, SAVE_SLOT_COUNT, 1.5, NaN]) {
      await expect(readSaveSlot(slot)).rejects.toThrow("Invalid save slot.");
      await expect(deleteSaveSlot(slot)).rejects.toThrow("Invalid save slot.");
    }
  });
});

describe("listSaveSlots", () => {
  it("always reports every slot, empty ones included", async () => {
    const slots = await listSaveSlots();
    expect(slots).toHaveLength(SAVE_SLOT_COUNT);
    expect(slots.every((s) => s.isEmpty)).toBe(true);
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks only the slots that hold a readable record", async () => {
    store.set("darkwar-save-slot-1", validRecordJson({ slot: 0 }));
    store.set("darkwar-save-slot-4", "{corrupt");
    const slots = await listSaveSlots();
    expect(slots[0].isEmpty).toBe(false);
    // A corrupt slot reads as empty rather than failing the whole listing.
    expect(slots[3].isEmpty).toBe(true);
  });
});

describe("writeSaveSlot", () => {
  it("persists a record that readSaveSlot can read back", async () => {
    const record = JSON.parse(validRecordJson());
    await writeSaveSlot(0, record);
    await expect(readSaveSlot(0)).resolves.toMatchObject({
      version: 1,
      slot: 0,
      region: "Megacorp Exterior",
    });
  });
});

/**
 * The slot preview is interpolated into a CSS `url('...')` inside a `style`
 * attribute. HTML escaping cannot secure that position — the HTML parser
 * decodes entities before CSS parses the value — so the preview is checked
 * against an allowlist instead. A save record is untrusted input like any
 * other field here.
 */
describe("isSafeImageDataUrl", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  it("accepts what capturePlayerSnapshot produces", () => {
    expect(isSafeImageDataUrl(PNG)).toBe(true);
    expect(isSafeImageDataUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg")).toBe(
      true,
    );
    expect(isSafeImageDataUrl("data:image/webp;base64,UklGRh4AAABXRUJQ")).toBe(
      true,
    );
  });

  it("rejects a payload that would break out of the CSS url()", () => {
    // The attack this guard exists for: close the url(), then append a
    // declaration that fetches an attacker URL when the slot renders.
    const breakout =
      "data:image/png;base64,AAAA'); background-image: url('http://evil.test/x";
    expect(isSafeImageDataUrl(breakout)).toBe(false);
    // Parens and quotes are outside the base64 alphabet, so none survive.
    for (const char of ["'", '"', "(", ")", ";", " ", "\\"]) {
      expect(isSafeImageDataUrl(`data:image/png;base64,AA${char}AA`)).toBe(
        false,
      );
    }
  });

  it("rejects schemes and media types that are not a still image", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "http://evil.test/x.png",
      "//evil.test/x.png",
      "",
    ]) {
      expect(isSafeImageDataUrl(value)).toBe(false);
    }
  });

  it("anchors both ends so nothing can be smuggled around the pattern", () => {
    expect(isSafeImageDataUrl(` ${PNG}`)).toBe(false);
    expect(isSafeImageDataUrl(`${PNG} `)).toBe(false);
    expect(isSafeImageDataUrl(`x${PNG}`)).toBe(false);
    expect(isSafeImageDataUrl(`${PNG}\n${PNG}`)).toBe(false);
  });
});
