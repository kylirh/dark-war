/**
 * Persistent user preferences for settings and keybindings.
 */

const BINDINGS = [
  ["moveUp", "Move Up", "KeyW"],
  ["moveLeft", "Move Left", "KeyA"],
  ["moveDown", "Move Down", "KeyS"],
  ["moveRight", "Move Right", "KeyD"],
  ["interact", "Interact / Read Sign (facing direction)", "KeyO"],
  ["speak", "Speak", "KeyT"],
  ["think", "Think", "Shift+KeyT"],
  ["pickup", "Pick Up", "KeyG"],
  ["reload", "Reload", "KeyR"],
  ["rest", "Rest / Stop Resting", "KeyH"],
  ["toggleCTDM", "Toggle CTDM", "KeyC"],
  ["toggleMatterManipulator", "Matter Manipulator", "KeyF"],
  ["lowerTerrain", "Lower Terrain", "BracketLeft"],
  ["raiseTerrain", "Raise Terrain", "BracketRight"],
  ["inventory", "Inventory", "KeyE"],
  ["gameMenu", "Game Menu / Back / Cancel", "Escape"],
  ["save", "Save Game", "Mod+KeyS"],
  ["load", "Load Game", "Mod+KeyO"],
  ["newGame", "New Game", "Mod+KeyN"],
  ["commandPrompt", "Development Command Prompt", "Slash"],
  ["completeCommand", "Complete Command Name", "Tab"],
  ["inventoryTab", "Inventory Tab", "Alt+Digit1"],
  ["settingsTab", "Settings Tab", "Alt+Digit2"],
  ["gameTab", "Game Tab", "Alt+Digit3"],
  ["menuUp", "Menu / Dialogue Up", "ArrowUp"],
  ["menuDown", "Menu / Dialogue Down", "ArrowDown"],
  ["menuLeft", "Menu / Story Previous", "ArrowLeft"],
  ["menuRight", "Menu / Story Next", "ArrowRight"],
  ["confirm", "Confirm / Send / Continue", "Enter"],
  ["deleteSave", "Delete Selected Save", "Delete"],
  ["fullscreen", "Toggle Full Screen", "F11"],
  ["slot1", "Hotbar Slot 1 / Dialogue Choice 1", "Digit1"],
  ["slot2", "Hotbar Slot 2 / Dialogue Choice 2", "Digit2"],
  ["slot3", "Hotbar Slot 3 / Dialogue Choice 3", "Digit3"],
  ["slot4", "Hotbar Slot 4 / Dialogue Choice 4", "Digit4"],
  ["slot5", "Hotbar Slot 5 / Dialogue Choice 5", "Digit5"],
  ["slot6", "Hotbar Slot 6 / Dialogue Choice 6", "Digit6"],
  ["slot7", "Hotbar Slot 7 / Dialogue Choice 7", "Digit7"],
  ["slot8", "Hotbar Slot 8 / Dialogue Choice 8", "Digit8"],
  ["slot9", "Hotbar Slot 9 / Dialogue Choice 9", "Digit9"],
  ["slot10", "Hotbar Slot 10", "Digit0"],
  ["slot11", "Hotbar Slot 11", "Minus"],
  ["slot12", "Hotbar Slot 12", "Equal"],
] as const;

export type KeyBindingAction = (typeof BINDINGS)[number][0];

type ThemeMode = "dark" | "light";

const VOLUME_STEP_PERCENT = 5;

/** Snap a volume percentage to the increments exposed by the settings sliders. */
export function quantizeVolumePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value / VOLUME_STEP_PERCENT) * VOLUME_STEP_PERCENT,
    ),
  );
}

export interface KeyBindingDefinition {
  action: KeyBindingAction;
  label: string;
}

export interface UserPreferences {
  sfxVolume: number;
  musicVolume: number;
  theme: ThemeMode;
  zoom: number;
  keyBindings: Record<KeyBindingAction, string>;
}

const PREFERENCES_KEY = "darkwar-preferences";
const LEGACY_THEME_KEY = "darkwar-ui-theme";

export const KEY_BINDING_DEFINITIONS: KeyBindingDefinition[] = BINDINGS.map(
  ([action, label]) => ({ action, label }),
);

export const DEFAULT_KEY_BINDINGS = Object.fromEntries(
  BINDINGS.map(([action, , key]) => [action, key]),
) as Record<KeyBindingAction, string>;

export const DEFAULT_PREFERENCES: UserPreferences = {
  sfxVolume: 0.5,
  musicVolume: 0.3,
  theme: "dark",
  zoom: 1,
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
      sfxVolume:
        quantizeVolumePercent(
          clampUnit(parsed.sfxVolume, DEFAULT_PREFERENCES.sfxVolume) * 100,
        ) / 100,
      musicVolume:
        quantizeVolumePercent(
          clampUnit(parsed.musicVolume, DEFAULT_PREFERENCES.musicVolume) * 100,
        ) / 100,
      theme: normalizeTheme(parsed.theme ?? legacyTheme),
      zoom: normalizeZoom(parsed.zoom),
      keyBindings: normalizeKeyBindings(parsed.keyBindings),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, keyBindings: { ...DEFAULT_KEY_BINDINGS } };
  }
}

export function savePreferences(preferences: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    localStorage.setItem(LEGACY_THEME_KEY, preferences.theme);
  } catch {
    // Preference persistence is best-effort; the active in-memory settings still apply.
  }
}

export function keyCodeToLabel(code: string): string {
  if (code.includes("+"))
    return code.split("+").map(keyCodeToLabel).join(" + ");
  if (code === "Mod") return "Ctrl / Cmd";
  const punctuation: Record<string, string> = {
    Slash: "/",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
  };
  if (punctuation[code]) return punctuation[code];
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

/** Encode a physical key with modifiers; Ctrl and Command share portable Mod. */
export function bindingFromEvent(event: KeyboardEvent): string | null {
  if (!event.code || /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(event.code))
    return null;
  return [
    event.ctrlKey || event.metaKey ? "Mod" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.code,
  ]
    .filter(Boolean)
    .join("+");
}

/** Match exactly, so typing Ctrl+S never also moves the player down. */
export function matchesBinding(
  event: KeyboardEvent,
  action: KeyBindingAction,
  preferences: UserPreferences = loadPreferences(),
): boolean {
  return bindingFromEvent(event) === preferences.keyBindings[action];
}

/** Current physical hotbar binding, shared by inventory labels and dialogue hints. */
export function slotBindingLabel(index: number): string {
  return keyCodeToLabel(
    loadPreferences().keyBindings[`slot${index + 1}` as KeyBindingAction] ?? "",
  );
}
