1. **Identify the UX Opportunity:** The multiplayer menus in `src/client/systems/game-menu.ts` use status elements (`#mp-host-status`, `#mp-browse-status`, `#mp-join-status`, `#mp-lobby-status`) to communicate connecting, error, and lobby states to the user. These elements currently lack `aria-live` attributes, meaning screen readers won't announce these important asynchronous status updates (like "Connecting..." or "Error scanning network.").
2. **Make the Change:**
   - In `src/client/systems/game-menu.ts`, find the HTML strings for the multiplayer views.
   - Add `role="status" aria-live="polite"` to `#mp-host-status`, `#mp-browse-status`, and `#mp-join-status`.
   - Add `role="status" aria-live="polite"` to `#mp-lobby-status`.
   - Add `aria-live="polite"` to `#mp-server-list` so that the text "Searching for games..." and "No games found..." is announced.
3. **Journal Entry:** Add an entry to `.jules/palette.md` noting the addition of `aria-live` to multiplayer status messages.
4. **Pre-commit Checks:** Run type checking, linting, formatting, and tests.
5. **Submit PR:** Submit the change with an appropriate title and description.
