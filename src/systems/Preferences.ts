/**
 * Persistent user preferences for settings and keybindings.
 */

export type KeyBindingAction =
  | "moveUp"
  | "moveLeft"
  | "moveDown"
  | "moveRight"
  | "interact"
  | "pickup"
  | "reload"
  | "toggleCTDM"
  | "weapon1"
  | "weapon2"
  | "weapon3"
  | "weapon4"
  | "toggleGodMode"
  | "toggleFOV";

export type ThemeMode = "dark" | "light";

export interface KeyBindingDefinition {
  action: KeyBindingAction;
  label: string;
  devOnly?: boolean;
}

export interface UserPreferences {
  sfxVolume: number;
  musicVolume: number;
  theme: ThemeMode;
  zoom: number;
  devTools: boolean;
  keyBindings: Record<KeyBindingAction, string>;
}

const PREFERENCES_KEY = "darkwar-preferences";
const LEGACY_THEME_KEY = "darkwar-ui-theme";

export const KEY_BINDING_DEFINITIONS: KeyBindingDefinition[] = [
  { action: "moveUp", label: "Move Up" },
  { action: "moveLeft", label: "Move Left" },
  { action: "moveDown", label: "Move Down" },
  { action: "moveRight", label: "Move Right" },
  { action: "interact", label: "Open Doors" },
  { action: "pickup", label: "Pickup" },
  { action: "reload", label: "Reload" },
  { action: "toggleCTDM", label: "Toggle CTDM" },
  { action: "weapon1", label: "Weapon 1" },
  { action: "weapon2", label: "Weapon 2" },
  { action: "weapon3", label: "Weapon 3" },
  { action: "weapon4", label: "Weapon 4" },
  { action: "toggleGodMode", label: "God Mode", devOnly: true },
  { action: "toggleFOV", label: "Toggle FOV", devOnly: true },
];

export const DEFAULT_KEY_BINDINGS: Record<KeyBindingAction, string> = {
  moveUp: "KeyW",
  moveLeft: "KeyA",
  moveDown: "KeyS",
  moveRight: "KeyD",
  interact: "KeyO",
  pickup: "KeyG",
  reload: "KeyR",
  toggleCTDM: "KeyC",
  weapon1: "Digit1",
  weapon2: "Digit2",
  weapon3: "Digit3",
  weapon4: "Digit4",
  toggleGodMode: "KeyM",
  toggleFOV: "KeyV",
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  sfxVolume: 0.5,
  musicVolume: 0.3,
  theme: "dark",
  zoom: 1,
  devTools: false,
  keyBindings: DEFAULT_KEY_BINDINGS,
};

function clampUnit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function normalizeZoom(value: unknown): number {
  return value === 2 || value === 3 ? value : 1;
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" ? "light" : "dark";
}

function normalizeKeyBindings(
  value: unknown,
): Record<KeyBindingAction, string> {
  const bindings = { ...DEFAULT_KEY_BINDINGS };
  if (!value || typeof value !== "object") {
    return bindings;
  }

  for (const definition of KEY_BINDING_DEFINITIONS) {
    const key = (value as Partial<Record<KeyBindingAction, unknown>>)[
      definition.action
    ];
    if (typeof key === "string" && key.length > 0) {
      bindings[definition.action] = key;
    }
  }

  return bindings;
}

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<UserPreferences>) : {};
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    return {
      sfxVolume: clampUnit(parsed.sfxVolume, DEFAULT_PREFERENCES.sfxVolume),
      musicVolume: clampUnit(parsed.musicVolume, DEFAULT_PREFERENCES.musicVolume),
      theme: normalizeTheme(parsed.theme ?? legacyTheme),
      zoom: normalizeZoom(parsed.zoom),
      devTools: parsed.devTools === true,
      keyBindings: normalizeKeyBindings(parsed.keyBindings),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, keyBindings: { ...DEFAULT_KEY_BINDINGS } };
  }
}

export function savePreferences(preferences: UserPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  localStorage.setItem(LEGACY_THEME_KEY, preferences.theme);
}

export function keyCodeToLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  if (code === "Space") return "Space";
  if (code === "ArrowUp") return "Up Arrow";
  if (code === "ArrowDown") return "Down Arrow";
  if (code === "ArrowLeft") return "Left Arrow";
  if (code === "ArrowRight") return "Right Arrow";
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}
