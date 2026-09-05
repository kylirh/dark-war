/**
 * Coverage for user-preference persistence.
 *
 * Preferences come back from localStorage as untrusted JSON, so every field is
 * run through a normalizer on load. These tests pin the normalizers, the
 * legacy-theme migration, and the rule that neither load nor save may throw -
 * both are called during startup, where an exception is a black screen.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  loadPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  DEFAULT_KEY_BINDINGS,
  quantizeVolumePercent,
  UserPreferences,
} from "./preferences";

describe("preferences", () => {
  let localStorageMock: Record<string, string>;
  let mockGetItem: ReturnType<typeof vi.fn>;
  let mockSetItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock = {};
    mockGetItem = vi.fn((key: string) => localStorageMock[key] ?? null);
    mockSetItem = vi.fn((key: string, value: string) => {
      localStorageMock[key] = value;
    });

    vi.stubGlobal("localStorage", {
      getItem: mockGetItem,
      setItem: mockSetItem,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("loadPreferences", () => {
    it("returns default preferences when localStorage is empty", () => {
      const prefs = loadPreferences();
      expect(prefs).toEqual({
        ...DEFAULT_PREFERENCES,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      });
    });

    it("returns default preferences when localStorage contains an empty object", () => {
      localStorageMock["darkwar-preferences"] = JSON.stringify({});
      const prefs = loadPreferences();
      expect(prefs).toEqual({
        ...DEFAULT_PREFERENCES,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      });
    });

    it("parses a full valid JSON config from localStorage", () => {
      const fullBindings = {
        ...DEFAULT_KEY_BINDINGS,
        moveUp: "ArrowUp",
        moveDown: "ArrowDown",
      };
      const savedPrefs: UserPreferences = {
        sfxVolume: 0.8,
        musicVolume: 0.2,
        theme: "light",
        zoom: 2,
        devTools: true,
        keyBindings: fullBindings,
      };
      localStorageMock["darkwar-preferences"] = JSON.stringify(savedPrefs);

      const prefs = loadPreferences();
      expect(prefs).toEqual(savedPrefs);
    });

    it("merges a partial config from localStorage with defaults", () => {
      const partialPrefs = {
        sfxVolume: 0.1,
        theme: "light" as const,
      };
      localStorageMock["darkwar-preferences"] = JSON.stringify(partialPrefs);

      const prefs = loadPreferences();
      expect(prefs).toEqual({
        ...DEFAULT_PREFERENCES,
        ...partialPrefs,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      });
    });

    it("falls back to defaults when JSON is invalid", () => {
      localStorageMock["darkwar-preferences"] = "{ invalid json }";
      const prefs = loadPreferences();
      expect(prefs).toEqual({
        ...DEFAULT_PREFERENCES,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      });
    });

    it("falls back to defaults when localStorage.getItem throws an error", () => {
      mockGetItem.mockImplementationOnce(() => {
        throw new Error("Security Error: Access to localStorage is denied");
      });
      const prefs = loadPreferences();
      expect(prefs).toEqual({
        ...DEFAULT_PREFERENCES,
        keyBindings: { ...DEFAULT_KEY_BINDINGS },
      });
    });
  });

  describe("value normalization", () => {
    const load = (
      raw: Record<string, unknown>,
    ): ReturnType<typeof loadPreferences> => {
      localStorageMock["darkwar-preferences"] = JSON.stringify(raw);
      return loadPreferences();
    };

    it("clamps volumes into 0..1 and rejects non-finite values", () => {
      expect(load({ sfxVolume: 5 }).sfxVolume).toBe(1);
      expect(load({ sfxVolume: -3 }).sfxVolume).toBe(0);
      expect(load({ sfxVolume: NaN }).sfxVolume).toBe(
        DEFAULT_PREFERENCES.sfxVolume,
      );
      expect(load({ musicVolume: "loud" }).musicVolume).toBe(
        DEFAULT_PREFERENCES.musicVolume,
      );
    });

    it("snaps volumes to five percent increments", () => {
      expect(quantizeVolumePercent(32)).toBe(30);
      expect(quantizeVolumePercent(33)).toBe(35);
      expect(load({ sfxVolume: 0.33 }).sfxVolume).toBe(0.35);
    });

    it("accepts only the three supported zoom levels", () => {
      expect(load({ zoom: 2 }).zoom).toBe(2);
      expect(load({ zoom: 3 }).zoom).toBe(3);
      // Anything else - including a plausible-looking 4 - falls back to 1.
      expect(load({ zoom: 4 }).zoom).toBe(1);
      expect(load({ zoom: 1.5 }).zoom).toBe(1);
      expect(load({ zoom: "2" }).zoom).toBe(1);
    });

    it("treats any theme other than light as dark", () => {
      expect(load({ theme: "light" }).theme).toBe("light");
      expect(load({ theme: "dark" }).theme).toBe("dark");
      expect(load({ theme: "sepia" }).theme).toBe("dark");
    });

    it("falls back to the legacy theme key when no theme is stored", () => {
      // Migration path for preferences written before theme moved into the
      // preferences blob.
      localStorageMock["darkwar-preferences"] = JSON.stringify({});
      localStorageMock["darkwar-ui-theme"] = "light";
      expect(loadPreferences().theme).toBe("light");
    });

    it("requires devTools to be exactly true", () => {
      expect(load({ devTools: true }).devTools).toBe(true);
      expect(load({ devTools: "true" }).devTools).toBe(false);
      expect(load({ devTools: 1 }).devTools).toBe(false);
    });
  });

  describe("key binding normalization", () => {
    it("merges stored bindings over the defaults", () => {
      localStorageMock["darkwar-preferences"] = JSON.stringify({
        keyBindings: { moveUp: "ArrowUp" },
      });
      const prefs = loadPreferences();
      expect(prefs.keyBindings.moveUp).toBe("ArrowUp");
      expect(prefs.keyBindings.moveLeft).toBe(DEFAULT_KEY_BINDINGS.moveLeft);
    });

    it("ignores empty or non-string bindings", () => {
      localStorageMock["darkwar-preferences"] = JSON.stringify({
        keyBindings: { moveUp: "", moveLeft: 42, moveDown: null },
      });
      const prefs = loadPreferences();
      expect(prefs.keyBindings.moveUp).toBe(DEFAULT_KEY_BINDINGS.moveUp);
      expect(prefs.keyBindings.moveLeft).toBe(DEFAULT_KEY_BINDINGS.moveLeft);
      expect(prefs.keyBindings.moveDown).toBe(DEFAULT_KEY_BINDINGS.moveDown);
    });

    it("drops bindings for actions absent from KEY_BINDING_DEFINITIONS", () => {
      // normalizeKeyBindings iterates KEY_BINDING_DEFINITIONS, which no longer
      // lists weapon1-4 (inventory slot keys took over weapon selection). A
      // stored weapon binding is therefore discarded, not honored. Pinning this
      // so the omission stays deliberate rather than looking like a lost edit.
      localStorageMock["darkwar-preferences"] = JSON.stringify({
        keyBindings: { weapon1: "KeyZ" },
      });
      expect(loadPreferences().keyBindings.weapon1).toBe(
        DEFAULT_KEY_BINDINGS.weapon1,
      );
    });

    it("returns a fresh bindings object rather than aliasing the defaults", () => {
      // DEFAULT_PREFERENCES.keyBindings IS DEFAULT_KEY_BINDINGS by reference,
      // so a load that handed back the shared object would let a rebind corrupt
      // the defaults for the rest of the session.
      const prefs = loadPreferences();
      expect(prefs.keyBindings).not.toBe(DEFAULT_KEY_BINDINGS);
      prefs.keyBindings.moveUp = "KeyQ";
      expect(DEFAULT_KEY_BINDINGS.moveUp).toBe("KeyW");
      expect(loadPreferences().keyBindings.moveUp).toBe("KeyW");
    });
  });

  describe("savePreferences", () => {
    it("saves preferences as JSON to localStorage", () => {
      const prefs: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        sfxVolume: 0.7,
        theme: "light",
      };

      savePreferences(prefs);

      expect(mockSetItem).toHaveBeenCalledWith(
        "darkwar-preferences",
        JSON.stringify(prefs),
      );
      expect(mockSetItem).toHaveBeenCalledWith("darkwar-ui-theme", "light");
      expect(localStorageMock["darkwar-preferences"]).toEqual(
        JSON.stringify(prefs),
      );
    });

    it("silently handles errors when localStorage.setItem throws", () => {
      mockSetItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceededError");
      });

      const prefs: UserPreferences = { ...DEFAULT_PREFERENCES };

      // This should not throw
      expect(() => savePreferences(prefs)).not.toThrow();
    });

    it("silently handles errors when JSON.stringify throws", () => {
      const stringifySpy = vi
        .spyOn(JSON, "stringify")
        .mockImplementationOnce(() => {
          throw new Error("TypeError: Converting circular structure to JSON");
        });

      try {
        const prefs: UserPreferences = { ...DEFAULT_PREFERENCES };

        // This should not throw
        expect(() => savePreferences(prefs)).not.toThrow();
      } finally {
        stringifySpy.mockRestore();
      }
    });
  });
});
