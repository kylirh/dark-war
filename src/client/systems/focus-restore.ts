/**
 * Focus restoration for the retro modal dialogs.
 *
 * `RetroModal.hide()` only adds a `hidden` class, and `.imb-dialog.hidden`
 * resolves to `display: none`. A control inside a closing dialog therefore
 * stops being focusable while it is still in the document, and the browser
 * drops focus to `<body>` — keyboard navigation restarts from the top of the
 * page. Dialogs capture their opener before showing and restore it on close.
 */

/** The game canvas, which carries `tabindex="-1"` so it can take focus. */
const GAME_CANVAS_ID = "game";

/**
 * The element that should regain focus when a dialog closes, or `null` when
 * there is no meaningful one.
 *
 * `document.body` is never a useful focus target — it is what the browser falls
 * back to when nothing is focused — so it is reported as absent and callers
 * fall back to the canvas rather than restoring focus to nothing.
 */
export function captureFocusOpener(
  doc: Document = document,
): HTMLElement | null {
  const active = doc.activeElement as HTMLElement | null;
  if (!active || active === doc.body) return null;
  return typeof active.focus === "function" ? active : null;
}

/**
 * Return focus to `opener`, or to the game canvas when the opener is absent or
 * cannot take focus.
 *
 * Being in the document is not the same as being focusable: a control inside a
 * dialog that was hidden while this one was open is still `contains()`-reachable,
 * but `display: none` and `disabled` both make `focus()` a silent no-op that
 * leaves focus on `<body>`. So the result is checked rather than assumed, and
 * the canvas takes over whenever the opener declined it.
 */
export function restoreFocus(
  opener: HTMLElement | null,
  doc: Document = document,
): void {
  if (opener && doc.body.contains(opener)) {
    opener.focus();
    if (doc.activeElement === opener) return;
  }
  doc.getElementById(GAME_CANVAS_ID)?.focus();
}
