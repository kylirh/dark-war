/**
 * Writing to an ARIA live region so it actually announces.
 *
 * The multiplayer menus report their network state ("Connecting...", "Error
 * scanning network.", lobby population) through small status elements that are
 * marked `role="status" aria-live="polite"`. Marking them is the easy half;
 * the announcement still depends on *how* the text is written, and both of the
 * ways to get it wrong fail silently — the markup looks correct and a screen
 * reader simply says nothing, or says it over and over.
 */

/**
 * Set the text of a polite live region, announcing only real changes.
 *
 * Two ordering rules, both of which the multiplayer menus originally got wrong:
 *
 * - **Reveal before writing.** `.imb-mp-status.hidden` and
 *   `.char-mp-status.hidden` are `display: none`, and a mutation inside a
 *   `display: none` subtree is not announced. Writing the text first and
 *   dropping the `hidden` class afterwards — the obvious order, and what both
 *   `setMpStatus` implementations did — yields a region that never speaks.
 * - **Skip no-op writes.** Assigning `textContent` replaces the text node even
 *   when the string is identical, and a polite region re-announces the result.
 *   These statuses are driven by a 3-second LAN discovery timer, so an
 *   unguarded write repeats "Error scanning network." every three seconds for
 *   as long as the user stays on the screen.
 *
 * An empty `text` hides the region again, matching the previous behaviour.
 * Elements that are never hidden (the lobby status) can use this too — the
 * class toggle is a no-op for them.
 */
export function setStatusText(el: HTMLElement, text: string): void {
  // Reveal first: the write below has to land in a rendered subtree.
  el.classList.toggle("hidden", !text);
  if (el.textContent === text) return;
  el.textContent = text;
}

/**
 * Sentinel states for the "what is currently rendered in the server list" key,
 * which otherwise holds an `ip:port:players:phase` join.
 *
 * A scan that legitimately finds nothing produces the empty key, so "nothing
 * rendered yet" cannot also be `""` — that collision made the first empty scan
 * look unchanged and left the browse list stuck on "Searching for games..."
 * instead of falling through to "No games found". `SERVER_LIST_ERROR` gives the
 * failure path the same idempotence, so a network error announces once rather
 * than on every discovery tick. Both carry a NUL, which no address, port, count
 * or phase can contain.
 */
export const SERVER_LIST_UNRENDERED = "\u0000unrendered";
export const SERVER_LIST_ERROR = "\u0000error";
