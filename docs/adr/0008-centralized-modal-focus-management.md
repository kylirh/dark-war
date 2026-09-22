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

## Options

### 1. Do nothing (Status Quo)

Continue relying on `.jules/palette.md` guidelines and developer memory to manually implement focus capture and restoration in every component that uses a modal.

**The case for this:** We have already paid the cost of fixing the existing focus bugs in `GameMenu`, `CharacterModal`, and `SaveSlotDialog`. The current `captureFocusOpener` and `restoreFocus` helper functions work well when developers remember to use them. Zero migration effort.

### 2. Move Focus Management into the Modal Component

Modify `RetroModal` (and similar primitive modal classes) to internally handle focus capture on open and restoration on close. The modal API would accept an optional `initialFocusSelector` or automatically focus the first focusable element inside itself.

**The case for this:** It structurally eliminates the bug class for all future dialogs. Focus management becomes a default capability of the presentation layer rather than an easily forgotten manual step. It encapsulates DOM accessibility concerns within the UI primitive.

## Decision

We recommend **Option 2: Move Focus Management into the Modal Component**.

The repeated focus-stranding issues recorded in the learning logs demonstrate that manual focus management is a porous convention. By baking capture and restore logic directly into `RetroModal`, we ensure that any new dialog automatically respects keyboard accessibility expectations without requiring boilerplate in the caller.

## Consequences

- **What gets better:** We structurally prevent a proven class of accessibility regressions. Instantiating components (like `GameMenu`) shed DOM-manipulation boilerplate.
- **What gets worse:** `RetroModal` becomes slightly more complex, as it must intelligently find a sensible default element to focus if none is specified, and must verify that the captured element is still in the DOM upon closing.
- **What becomes harder to change:** Highly bespoke focus behavior (e.g., intentionally not restoring focus under specific complex conditions) might require escape hatches or bypass flags in the new modal API.
- **Migration cost:** Low. We can update `RetroModal` to handle focus internally and subsequently strip the redundant `captureFocusOpener`/`restoreFocus` calls from its current consumers (`GameMenu`, `SaveSlotDialog`, etc.).
