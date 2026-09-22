# 0008 - Centralized Modal Focus Management

**Status:** Proposed
**Date:** 2026-09-22

## Context

Dark War uses generic modal components (like `RetroModal`) to build floating dialogs. Currently, these components do not automatically manage keyboard focus. Instead, it is left as a convention that the instantiating component (e.g., `GameMenu`, `SaveSlotDialog`) must capture `document.activeElement` before opening the modal, explicitly shift focus into the modal during the `onOpen` hook, and restore it during `onClose`.

This design relies entirely on developer discipline and has repeatedly failed. The `.jules/palette.md` learning log records multiple instances of accessibility regressions caused by this exact seam:

- **2024-11-20:** The "About Dark War" dialog stranded focus on the underlying UI because `GameMenu` failed to capture and restore focus.
- **2026-09-03:** The Character Modal left the active element on the background canvas upon opening because it lacked a programmatic focus shift.
- **2026-09-13:** The Game Over screen required manual CSS visibility toggles and programmatic focus shifts that were initially overlooked.
- **2026-09-19:** Closing the main pause menu or the save slot dialog stranded keyboard focus because focus restoration was missing from the implementing components.

Every time a new modal or dialog is added, developers must perfectly hand-write the focus capture and restoration logic. The recurring bug class proves this convention is not scaling safely and imposes a continuous tax on accessibility reviews.

Since the 2026-09-19 entry, the capture and restore halves have been extracted into `src/client/systems/focus-restore.ts` (`captureFocusOpener`, `restoreFocus`). That removes the duplicated bodies but not the obligation: a caller that never invokes them still strands focus, which is the failure mode every entry above describes.

### The constraint that shapes this decision

`RetroModal` **deliberately** omits `aria-modal` and a focus trap, and the reason is recorded in the component itself (`src/client/systems/retro-modal.ts:44-53`): these windows stack. The Electron application menu can open the About dialog on top of the pause dialog, `GameMenu.syncModalState` keeps one shared scrim for "any modal open", and Escape closes the topmost of a list.

Stacking is what makes centralization non-trivial, because "the element to restore to" stops being a single value per modal:

- If each modal captures on `show()` and restores on `hide()`, closing a _lower_ dialog while a higher one is open restores focus out from under the dialog the user is actually in.
- The capture itself can land inside another dialog. `GameMenu` already guards this by only capturing when the dialog was not already open (`.jules/palette.md`, 2026-09-19).
- Restoring into a dialog that was hidden while another was open targets a subtree that is `display: none` (`.imb-dialog.hidden`, `app/assets/css/styles.css:610`), where `focus()` silently does nothing.

Any centralized owner has to answer these; a per-caller convention answers them ad hoc, which is part of why it keeps failing.

## Options

### 1. Do nothing (Status Quo)

Continue relying on `.jules/palette.md` guidelines and developer memory to call `captureFocusOpener` and `restoreFocus` in every component that uses a modal.

**The case for this:** We have already paid the cost of fixing the existing focus bugs in `GameMenu`, `CharacterModal`, and `SaveSlotDialog`. The helpers work well when developers remember to use them. Zero migration effort.

**The case against:** "When developers remember" is the whole defect. Four recorded regressions at one seam is the evidence that the reminder does not survive contact with new dialogs.

### 2. A shared open/close wrapper the callers opt into

Keep `RetroModal` unaware of focus, but replace the hand-written `onOpen`/`onClose` bodies with one helper that owns the whole sequence — capture, shift into the dialog, restore on close — so a caller writes one call instead of three correct steps.

**The case for this:** It is the smallest change that removes the per-caller reasoning, and it leaves stacking policy in `GameMenu`, which is already the component that tracks which dialogs are open and closes the topmost. It composes with the existing `focus-restore.ts` rather than replacing it.

**The case against:** It is still opt-in. A new dialog that never calls the wrapper fails exactly as today, so it narrows the bug class without structurally eliminating it.

### 3. Move Focus Management into the Modal Component

Modify `RetroModal` (and similar primitive modal classes) to internally handle focus capture on open and restoration on close. The modal API would accept an optional `initialFocusSelector` or automatically focus the first focusable element inside itself.

**The case for this:** It structurally eliminates the bug class for all future dialogs. Focus management becomes a default capability of the presentation layer rather than an easily forgotten manual step. It encapsulates DOM accessibility concerns within the UI primitive.

**The case against:** It puts stacking policy inside a component that deliberately knows nothing about the stack. `RetroModal` has no view of which other dialogs are open, so restore-on-`hide()` is wrong for a dialog closed underneath another one, and it would need either a shared stack the modals consult or an escape hatch the callers drive — at which point some of the coordination is back with the callers.

## Decision

We recommend centralizing, and treat the choice between **Option 2** and **Option 3** as the open question rather than one this document settles.

The repeated focus-stranding issues recorded in the learning logs demonstrate that manual focus management is a porous convention, so the status quo is not adequate. Which centralization is right depends on where stacking policy should live — with `GameMenu`, which already tracks the open set, or with a shared stack that `RetroModal` consults. That is a judgement about the client's UI ownership boundaries, and it belongs to a human rather than to this document.

## Consequences

- **What gets better:** We structurally prevent a proven class of accessibility regressions. Instantiating components (like `GameMenu`) shed DOM-manipulation boilerplate.
- **What gets worse:** Whichever option is taken, the owner must handle stacking explicitly — including not restoring focus when a dialog is closed beneath an open one.
- **Restoration needs more than a presence check.** The current guard is `document.body.contains(opener)` (`focus-restore.ts`), which answers "is it in the document", not "can it take focus". A control inside a dialog hidden while another was open is still `contains()`-reachable while `focus()` on it is a no-op, so focus lands on `<body>` — the stranding this is meant to prevent. A centralized owner should confirm the focus actually landed rather than assume it did. (#285 proposes exactly this for `restoreFocus` and is still open; if it lands first, the centralized version should inherit that behaviour rather than reintroduce the weaker check.)
- **What becomes harder to change:** Highly bespoke focus behavior (e.g., intentionally not restoring focus under specific complex conditions) might require escape hatches or bypass flags in the new modal API.
- **Migration cost:** Low for Option 2 — the call sites already exist and would be rewritten one line at a time. Higher for Option 3, which additionally needs a stack-aware restore before the existing consumers (`GameMenu`, `SaveSlotDialog`) can be stripped.
- **Out of scope:** this is about restoring focus around open and close. Adding a focus _trap_ or `aria-modal` is a separate decision, and `retro-modal.ts:44-53` records the current answer as deliberate.
