## 2024-11-20 - Story Overlay Focus Management

**Learning:** The story overlay expansion button was previously blurring itself immediately upon click `storyExpandTab.blur()` to remove a focus ring. This broke keyboard navigation.
**Action:** Used `:focus:not(:focus-visible)` and `:focus-visible` in CSS instead to manage focus styles natively for keyboard versus mouse interactions, and added standard ARIA attributes (`aria-expanded`, `aria-controls`) to correctly communicate state to assistive technologies.

## 2024-05-18 - Avoid Specificity Traps with :focus:not(:focus-visible)
**Learning:** When attempting to remove focus rings for mouse clicks, using `:focus:not(:focus-visible)` introduces a high specificity (0,3,0) that can inadvertently override base `:hover` states (0,2,0) if styles are reset explicitly (like `background: transparent;`). This leads to a momentary loss of hover styles when an element is clicked.
**Action:** Instead of actively resetting styles via `:focus:not(:focus-visible)`, rely on combining `:focus-visible` with hover selectors (e.g., `.button:hover, .button:focus-visible`) and omitting the `:focus` selector entirely. If base overrides are required for outlines, use `outline: none;` rather than changing backgrounds or colors.
