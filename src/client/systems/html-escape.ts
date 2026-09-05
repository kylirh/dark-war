/**
 * HTML escaping for the UI layer.
 *
 * Several panels build markup as template strings and assign it to
 * `innerHTML`. Any value in one of those strings that did not come from a
 * literal in the source — a player name, a save-file field, a LAN discovery
 * packet — has to be escaped on the way in.
 *
 * This used to be four byte-identical private copies (game-menu, save-slots,
 * character-modal, intro-story) plus a fifth `escapeAttribute` variant that
 * only save-slots had. That is the failure mode this module exists to prevent:
 * whoever needed the stricter version fixed it locally, and the other three
 * files kept the weaker one.
 */

/**
 * Escape `value` for interpolation into an HTML string.
 *
 * Covers text content and both single- and double-quoted attribute values.
 * Apostrophes are escaped too, so `title='${escapeHtml(name)}'` is as safe as
 * the double-quoted form — a distinction easy to get wrong at the call site,
 * and not worth a second function to track.
 *
 * Two things this deliberately does not do:
 *
 * - **Unquoted attributes.** `<div class=${escapeHtml(x)}>` stays injectable
 *   through spaces; always quote the attribute.
 * - **Nested languages.** A value that ends up inside `style="..."` or an
 *   inline `on*` handler is parsed again as CSS or JavaScript *after* the HTML
 *   parser has decoded these entities, so escaping here buys nothing. Validate
 *   those against an allowlist instead (see `isSafeImageDataUrl` in
 *   save-slots.ts) or set them through the DOM.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
