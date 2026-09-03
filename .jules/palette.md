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
