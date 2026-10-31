## 2024-11-20 - Story Overlay Focus Management

**Learning:** The story overlay expansion button was previously blurring itself immediately upon click `storyExpandTab.blur()` to remove a focus ring. This broke keyboard navigation.
**Action:** Used `:focus:not(:focus-visible)` and `:focus-visible` in CSS instead to manage focus styles natively for keyboard versus mouse interactions, and added standard ARIA attributes (`aria-expanded`, `aria-controls`) to correctly communicate state to assistive technologies.

## 2026-08-30 - The story-tab fix was reported twice because the dev page is a second copy

**Learning:** Three separate UI reviews filed the same story-expand-tab bug —
`blur()` on click, no `aria-expanded` — after it had already been fixed. The
fix was real and had landed; it just landed in `app/index.html`, and the
reviews were looking at the root `index.html` that `npm run dev:web` serves.
Two hand-maintained copies of the same shell, and only one got the patch.

**Action:** Regenerated the dev entry from `app/index.html` so they differ only
in the entry `<script>`, and added `src/client/dev-entry-parity.test.ts` to
fail the build if they ever diverge again. The real fix was the drift, not the
markup.

**Also removed:** a `scale-toggle` button that existed only in the dev copy. It
cycled 1X/2X/3X by calling `setScale` directly, bypassing `preferences.zoom` —
so it silently disagreed with the shipped Zoom control in the character modal,
which does the same job properly. A UI review asked for it to be styled; the
better answer was to delete it, since styling it would have made a duplicate,
desyncing control look official.

**Prevention:** When a UI bug is reported that you believe is already fixed,
check _which_ file the reporter was looking at before dismissing it. A stale
duplicate reads exactly like a regression.

## 2026-09-01 - GameMenu Keyboard Focus and ARIA Navigation

**Learning:** The pause menu in `GameMenu` misused ARIA `role="menu"` on a container with native `<button>`s, breaking screen reader expectations for keyboard interactions. Furthermore, opening the menu stranded keyboard focus on the background canvas because it lacked a call to sync and apply focus, and Tab navigation desynced internal selection state from actual DOM focus.

**Action:** Removed invalid `role="menu"`, `role="menuitem"`, and `aria-selected` attributes to let buttons function naturally. Added `this.syncPauseMenu()` in `openPauseMenu()` to properly shift focus into the dialog upon opening. Added a `focus` event listener to sync internal selection when a user navigates via the `Tab` key.

**Prevention:** Do not use `role="menu"` for lists of buttons navigating views or performing app actions unless implementing strict roving tabindex or `aria-activedescendant` logic. Ensure modals actively move `document.activeElement` into themselves upon opening.

## 2026-09-03 - Focus-visible outlines and decorative window controls

**Learning:** Mouse activation should not leave focus styling on every control, but removing focus styling entirely would make keyboard navigation invisible. Window-control glyphs are decorative when the button already has an accessible label.

**Action:** Use `:focus-visible` for interactive focus styling and mark the visual window-control glyphs `aria-hidden="true"` so keyboard users retain a clear focus indicator without duplicate screen-reader announcements.

## 2026-09-03 - Character Modal Keyboard Focus and Tab ARIA Roles

**Learning:** The character modal lacked ARIA standard attributes (`role="dialog"`, `aria-modal`, `aria-label`) rendering it opaque to assistive technologies upon opening. Focus management was missing when opening the modal, causing the active element to remain on the background canvas. Additionally, the modal's tabs lacked proper `role="tablist"`, `role="tab"`, `role="tabpanel"`, and `aria-selected` attributes, hiding tab state from screen readers.

**Action:** Added `role="dialog"`, `aria-modal="true"`, and an accessible label to the character modal window. Automatically shifted focus into the modal tab list (`tabButtons.get(tab)?.focus()`) inside `open()`. Decorated the custom tab implementation with standard ARIA roles (`tablist`, `tab`, `tabpanel`) and dynamically toggled `aria-selected` during tab switches so users are aware of the active view.

**Prevention:** Always mark modal containers with `role="dialog"` and `aria-modal="true"`, and explicitly shift focus into them upon presentation. When building custom tab views, implement the full set of tab roles and `aria-selected` to convey state to screen readers.

## 2026-09-04 - Modal dialog semantic roles and attributes

**What was found:** The `RetroModal` component (`src/client/systems/retro-modal.ts`) creates floating dialogs but failed to identify itself to assistive technologies. It lacked a `role="dialog"` attribute and a programmatically associated accessible name (via `aria-labelledby`), so the About, pause, and save-slot windows were announced as anonymous groups.

**Action:** Modified `RetroModal` to add `role="dialog"` and `aria-labelledby` to its main `imb-dialog` wrapper element, generating an ID for the title text `<span>` from the modal's ID to serve as the target.

**Rejected in review:** the first version of this change also set `aria-modal="true"`. That is wrong for this component. `RetroModal` windows stack — `GameMenu.syncModalState` keeps one shared scrim for "any modal open" and Escape closes the topmost of a list, and the Electron application menu can open the About dialog while the pause dialog is already up. `aria-modal="true"` tells assistive technology to treat everything outside the dialog as inert, so two open windows would each hide the other. `RetroModal` also has no focus trap, which the original change acknowledged. The attribute was dropped.

**Prevention:** `aria-modal="true"` is a claim about runtime behavior, not a decoration that belongs on anything dialog-shaped. Only assert it where exactly one dialog can be open and focus is actually confined to it — the character modal, which owns a click-to-close scrim, qualifies; a stacking window manager does not. `role="dialog"` plus an `aria-labelledby` accessible name is safe either way.

## 2026-09-13 - Focus and tab order in Game Over screen

**What was found:** The Game Over screen (`.game-over-overlay`) was managing visibility solely through CSS `opacity`, leaving its interactive elements (the Respawn and New Game buttons) present in the DOM tab order even when invisible. Additionally, when a player died, focus remained on whatever was previously active (typically the canvas) rather than moving to the actionable buttons on the newly revealed overlay. Conversely, if a player clicked "Respawn" and the overlay faded out, the now-invisible button retained focus.

**Action:**

1. Added `visibility: hidden` to `.game-over-overlay` and `visibility: visible` to `.game-over-overlay.visible` in `styles.css`.
2. Added CSS transitions to coordinate the fade: `transition: opacity 1s ease-in, visibility 0s linear 1s` when hiding (delays hiding visibility until fade completes) and `transition: opacity 1s ease-in, visibility 0s linear` when showing.
3. Added `tabindex="-1"` to the game `<canvas>` element to allow programmatic focus without inserting it into the natural tab cycle.
4. Modified `syncGameOverOverlay()` in `src/client/main.ts` to actively manage focus: it shifts focus to `#respawn-button` when the overlay appears, and restores focus to `#game` when it hides.

**Prevention:** Never rely on `opacity` alone or `pointer-events: none` to hide interactive UI; always use `visibility: hidden` or `display: none` so that the elements are properly removed from the keyboard tab sequence and accessibility tree. When showing a blocking overlay or modal state, proactively move `document.activeElement` into it, and return focus to the main application context when it is dismissed.

## 2024-11-20 - GameMenu About Dialog Keyboard Focus

**What was found:** The "About Dark War" dialog was opened via `GameMenu.openAboutDialog()` but did not move keyboard focus into the dialog's contents upon appearing, stranding screen readers and keyboard users on the underlying UI. Additionally, when the dialog was closed, focus was not returned to the element that triggered it.

**Action:** Updated `GameMenu` to cache `document.activeElement` before calling `showModal("about-dialog")`. Modified the `aboutDialog` instantiation to include an `onOpen` hook that explicitly calls `.focus()` on the dialog's close button, and an `onClose` hook that restores focus to the previously active element.

**Prevention:** Generic modal components in Dark War (e.g., `RetroModal`) do not automatically manage focus shifting natively. The instantiating component is strictly responsible for capturing `document.activeElement`, explicitly shifting focus to the modal's contents during the `onOpen` hook, and restoring it in `onClose`.

## 2024-11-20 - Intro Story Keyboard Navigation

**What was found:** The `IntroStory` window (`src/client/systems/intro-story.ts`) intercepts "Enter" and Space keys unconditionally in its global `keydown` event listener to advance the story text. If a keyboard user navigated via Tab to the "Back" or "Skip" buttons and pressed Enter or Space to activate them, the event was captured, default prevented, and the story would advance instead of executing the button's action.

**Action:** Modified the `keydown` event listener in `IntroStory` to ignore "Enter" and Space key presses if the `document.activeElement` is an `HTMLButtonElement`.

**Prevention:** When capturing general navigation keys (like Enter or Space) in global or modal event listeners, ensure they do not steal focus or intercept events from natively interactive elements (like buttons) to preserve keyboard accessibility pathways.

## 2026-09-19 - Restore focus on dialog close

**What was found:** Closing the main pause menu or the save slot dialog would strand keyboard focus, breaking keyboard navigation flow. While `RetroModal` handles UI rendering for modals, focus restoration was missing from the implementing components (`GameMenu` and `SaveSlotDialog`).

**Action:** Updated `GameMenu` and `SaveSlotDialog` to capture `document.activeElement` right before calling `RetroModal.show()` (checking that the dialog wasn't already open, to prevent capturing an element _inside_ the modal). Added an `onClose` hook to restore focus to that captured element, falling back to focusing the `#game` canvas if the element was no longer in the document.

**Prevention:** When implementing new dialogs using `RetroModal`, explicitly manage focus shifting: capture the active element before opening, and restore focus to it on close, checking `document.body.contains(element)` to handle elements that were removed while the dialog was open.

## 2026-09-21 - Character modal missing ARIA toggle states

**What was found:** The Character modal's Settings tab contains Appearance controls (Theme and Zoom) that are visually styled as toggle buttons and structurally grouped with `role="group"`. However, when a button was clicked to change the selection, its state was only reflected visually via a `selected` CSS class, without updating `aria-pressed` for assistive technologies. (This inconsistently omitted the ARIA state that `GameMenu` properly implements for its own identical toggles).

**Action:** Updated `syncAppearanceControls` in `src/client/systems/character-modal.ts` to explicitly set `btn.setAttribute("aria-pressed", String(isSelected))` on both the theme and zoom toggle buttons whenever their state is synchronized.

**Prevention:** Whenever implementing UI controls that function as toggles within a `role="group"` container, always ensure that both visual cues (`selected` classes) and semantic state attributes (`aria-pressed`) are kept in sync so that the state change is announced by screen readers.

## 2024-11-20 - IntroStory Focus Restoration

**What was found:** The `IntroStory` component (mission briefing sequence) is presented as a modal dialog (`role="dialog"`, `aria-modal="true"`) but failed to restore keyboard focus back to the element that triggered it (e.g., the "New Game" button) upon being skipped or completed. This left keyboard focus stranded on the `<body>` element or game canvas, breaking keyboard navigation flow.

**Action:** Added `this.previousFocus = document.activeElement as HTMLElement | null;` to the `IntroStory` constructor to capture the active element before the dialog steals focus. Updated the `dispose()` method to restore focus to `this.previousFocus` if it is still in the document; otherwise, it falls back to focusing the game canvas.

**Prevention:** Modal or overlay components that intercept and manage focus must explicitly capture `document.activeElement` when opening and restore focus to it upon closing, falling back to a sensible default if the element no longer exists.

## 2026-10-12 - Character modal missing ARIA labels on appearance toggles

**What was found:** The Character modal's Settings tab contains Appearance controls (Theme and Zoom) that are structurally grouped with `role="group"`. However, they were missing the `aria-label` attribute, which meant screen readers would announce them as generic, anonymous groups rather than identifying them as the "Appearance mode" and "Zoom level" toggle groups. The labels were never present: `git log -S` shows the only commit touching them is this one, while the `role="group"` has been there since #252 — so this is a gap against `GameMenu`'s equivalent markup (`game-menu.ts:258`, `:265`), not a regression.

**Action:** Updated the creation of both the `themeToggle` and `zoomToggle` elements in `src/client/systems/character-modal.ts` to include `themeToggle.setAttribute("aria-label", "Appearance mode")` and `zoomToggle.setAttribute("aria-label", "Zoom level")`.

**Prevention:** Whenever implementing UI controls that function as toggles within a `role="group"` container, always ensure that the container itself has a descriptive `aria-label` so its purpose is clearly conveyed to assistive technologies.

## 2026-10-23 - Fix character modal focus restoration

**What was found:** The CharacterModal explicitly returned focus to the game canvas rather than restoring focus to the element that opened it, which is the last modal in `src/client/systems/` that had not adopted the focus contract documented in `retro-modal.ts`. The reachable path: the input listener is on `window` with no active-element guard, so a keyboard user sitting on a control that the modal does not hide — `#story-expand-tab`, or one of the window-chrome buttons in `app/index.html` — can press `E` to open the modal, and closing it moved focus to the canvas instead of back to that control, so tab order restarted from the top of the page. Focus was already gated on `ownedFocus`, so the modal never stole focus it did not hold; the defect was only in where it handed focus back.

**Action:** Added `captureFocusOpener` and `restoreFocus` from `focus-restore.ts` to `character-modal.ts`, capturing the opener element before rendering the modal, and explicitly restoring focus to it on close.

**Prevention:** For modals, always capture the element that initiated the modal opening before shifting focus. Do not hardcode focus restoration to the game canvas if there's a possibility the modal was opened from a different element.

## 2026-10-29 - CalloutComposer stranded focus on body when it closed

**What was found:** `CalloutComposer.open()` calls `this.input.focus()`, and
`close()` sets `this.element.hidden = true` without handing focus anywhere. The
focused input is inside the element being hidden, so the browser drops focus to
`<body>` and tab order restarts at the top of the page — exactly the failure
`focus-restore.ts` was written for, and the only one of these overlays that
restores nothing at all. Reachable from any say/think keypress.

**Action:** adopted `captureFocusOpener()` / `restoreFocus()` in
`callout-composer.ts` only, gated on `this.element.contains(document.activeElement)`
so the composer never takes focus it was not holding. `restoreFocus(null)`
falls back to the canvas, so the no-opener case behaves as before.

**Deliberately left alone:** `dialogue-panel.ts` and `sign-reader.ts`. This
pull request changed those too, replacing their hardcoded
`getElementById("game")?.focus()` with the helper. They are not the same case:
both are opened by the simulation when the player walks up to a sign or an NPC,
not by a control the player focused, so whether they have a meaningful "opener"
is a product question. #412 reached that same conclusion and says so in the
docblock of `modal-focus-contract.test.ts`, which keeps them out of the adopter
set on purpose. Do not re-propose it as a defect; it needs a human to decide
what those two should focus on close, and then both the code and that docblock
change together.

**Prevention:** a dialog that hides a focused control and restores nothing is a
defect with no product question attached — fix those. A dialog that restores to
the canvas _on purpose_ is a different thing, and whether the canvas is the
right target depends on how the dialog is opened.

## 2024-03-01 - Add tabindex to dialogue panel root

**What was found:** The `DialoguePanel` in `src/client/systems/dialogue-panel.ts` had a defensive fallback to focus its root container if no interactive elements (free text, choice buttons, or next button) were present in the conversation view. Although the current server logic ensures this state is structurally unreachable (`canContinue` is true when the other options are exhausted), the fallback branch is kept for total coverage. However, the root element is a `<div>` and lacked a `tabindex`, meaning if this defensive path were ever hit, the programmatic `.focus()` call on it would be a silent no-op, stranding keyboard focus on the document body.

**Action:** Added `this.root.tabIndex = -1;` to `DialoguePanel`'s initialization so the dialog root can receive programmatic focus and maintain a valid interactive path.

**Prevention:** When an interface component falls back to focusing its container to keep focus contained within a modal or panel, ensure that non-interactive containers (like `<div>` or `<section>`) are assigned `tabindex="-1"` so they can legally receive programmatic focus.
