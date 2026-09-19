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
