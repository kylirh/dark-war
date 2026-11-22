/** Exercise physical-key routing, remapping, typing isolation, and movement release. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputCallbacks, InputHandler } from "./input";
import {
  bindingFromEvent,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_PREFERENCES,
  KEY_BINDING_DEFINITIONS,
  matchesBinding,
  UserPreferences,
} from "./preferences";

class FakeElement {
  public isContentEditable = false;
  public constructor(private readonly editable = false) {}
  public matches(): boolean {
    return this.editable;
  }
}

function key(
  code: string,
  modifiers: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return Object.assign(
    new Event("keydown", { cancelable: true }),
    {
      code,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
    },
    modifiers,
  ) as KeyboardEvent;
}

describe("keyboard routing", () => {
  let surface: EventTarget;
  let preferences: UserPreferences;
  let callbacks: InputCallbacks;
  let input: InputHandler;
  let modal: boolean;
  let blocked: boolean;
  beforeEach(() => {
    surface = new EventTarget();
    preferences = {
      ...DEFAULT_PREFERENCES,
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
    };
    modal = false;
    blocked = false;
    vi.stubGlobal("window", surface);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", {
      body: { classList: { contains: (): boolean => modal } },
    });
    callbacks = {
      onUpdateVelocity: vi.fn(),
      onFire: vi.fn(),
      onInteract: vi.fn(),
      onOpenCalloutComposer: vi.fn(),
      onPickup: vi.fn(),
      onWait: vi.fn(),
      onReload: vi.fn(),
      onToggleCTDM: vi.fn(),
      onToggleMatterManipulator: vi.fn(),
      onPrototypeLower: vi.fn(),
      onPrototypeRaise: vi.fn(),
      onOpenCommandPrompt: vi.fn(),
      onResumePause: vi.fn(),
      onNewGame: vi.fn(),
      onSave: vi.fn(),
      onLoad: vi.fn(),
      onSelectWeapon: vi.fn(),
      onSelectInventorySlot: vi.fn(),
      onOpenInventory: vi.fn(),
      onCycleSlot: vi.fn(),
    };
    input = new InputHandler(
      callbacks,
      () => preferences,
      () => blocked,
    );
  });
  afterEach(() => {
    input.dispose();
    vi.unstubAllGlobals();
  });

  it("has exactly one visible definition and distinct default for every action", () => {
    expect(KEY_BINDING_DEFINITIONS.map((entry) => entry.action).sort()).toEqual(
      Object.keys(DEFAULT_KEY_BINDINGS).sort(),
    );
    expect(new Set(Object.values(DEFAULT_KEY_BINDINGS)).size).toBe(
      KEY_BINDING_DEFINITIONS.length,
    );
  });

  it("routes modifiers separately and never moves on a save shortcut", () => {
    surface.dispatchEvent(key("KeyS", { ctrlKey: true }));
    expect(callbacks.onSave).toHaveBeenCalledOnce();
    expect(callbacks.onUpdateVelocity).not.toHaveBeenCalled();
    surface.dispatchEvent(key("KeyT", { shiftKey: true }));
    surface.dispatchEvent(key("KeyT"));
    expect(callbacks.onOpenCalloutComposer).toHaveBeenNthCalledWith(
      1,
      "thought",
    );
    expect(callbacks.onOpenCalloutComposer).toHaveBeenNthCalledWith(
      2,
      "speech",
    );
    expect(bindingFromEvent(key("ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(
      matchesBinding(key("KeyS", { metaKey: true }), "save", preferences),
    ).toBe(true);
  });

  it("remaps rest, hotbar, inventory, and commands without hardcoded fallbacks", () => {
    preferences.keyBindings.rest = "KeyZ";
    preferences.keyBindings.slot12 = "KeyX";
    preferences.keyBindings.inventory = "KeyI";
    preferences.keyBindings.commandPrompt = "Backquote";
    for (const code of ["KeyH", "Equal", "KeyE", "Slash"])
      surface.dispatchEvent(key(code));
    expect(callbacks.onWait).not.toHaveBeenCalled();
    expect(callbacks.onOpenInventory).not.toHaveBeenCalled();
    for (const code of ["KeyZ", "KeyX", "KeyI", "Backquote"])
      surface.dispatchEvent(key(code));
    expect(callbacks.onWait).toHaveBeenCalledOnce();
    expect(callbacks.onSelectInventorySlot).toHaveBeenCalledWith(11);
    expect(callbacks.onOpenInventory).toHaveBeenCalledWith("inventory");
    expect(callbacks.onOpenCommandPrompt).toHaveBeenCalledOnce();
  });

  it("releases held movement even after modifiers change or input becomes blocked", () => {
    surface.dispatchEvent(key("KeyW"));
    expect(callbacks.onUpdateVelocity).toHaveBeenLastCalledWith(0, -225);
    blocked = true;
    modal = true;
    const release = new Event("keyup");
    Object.assign(release, { code: "KeyW", ctrlKey: true });
    surface.dispatchEvent(release);
    expect(callbacks.onUpdateVelocity).toHaveBeenLastCalledWith(0, 0);
  });

  it("does not repeat toggles and resets on blur or opening the prompt", () => {
    surface.dispatchEvent(key("KeyH", { repeat: true }));
    expect(callbacks.onWait).not.toHaveBeenCalled();
    surface.dispatchEvent(key("KeyW"));
    surface.dispatchEvent(key("Slash"));
    expect(callbacks.onUpdateVelocity).toHaveBeenLastCalledWith(0, 0);
    surface.dispatchEvent(key("KeyD"));
    surface.dispatchEvent(new Event("blur"));
    expect(callbacks.onUpdateVelocity).toHaveBeenLastCalledWith(0, 0);
  });

  it("ignores world shortcuts while typing or while another surface owns input", () => {
    const event = key("KeyH");
    Object.defineProperty(event, "target", { value: new FakeElement(true) });
    surface.dispatchEvent(event);
    blocked = true;
    surface.dispatchEvent(key("Slash"));
    expect(callbacks.onWait).not.toHaveBeenCalled();
    expect(callbacks.onOpenCommandPrompt).not.toHaveBeenCalled();
  });
});
