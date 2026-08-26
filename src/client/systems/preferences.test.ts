import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  loadPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  DEFAULT_KEY_BINDINGS,
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

    it("parses valid JSON from localStorage", () => {
      const savedPrefs: Partial<UserPreferences> = {
        sfxVolume: 0.8,
        musicVolume: 0.2,
        theme: "light",
        zoom: 2,
        devTools: true,
      };
      localStorageMock["darkwar-preferences"] = JSON.stringify(savedPrefs);

      const prefs = loadPreferences();
      expect(prefs.sfxVolume).toBe(0.8);
      expect(prefs.musicVolume).toBe(0.2);
      expect(prefs.theme).toBe("light");
      expect(prefs.zoom).toBe(2);
      expect(prefs.devTools).toBe(true);
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
  });
});
