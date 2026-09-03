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
