## 2024-11-20 - Story Overlay Focus Management

**Learning:** The story overlay expansion button was previously blurring itself immediately upon click `storyExpandTab.blur()` to remove a focus ring. This broke keyboard navigation.
**Action:** Used `:focus:not(:focus-visible)` and `:focus-visible` in CSS instead to manage focus styles natively for keyboard versus mouse interactions, and added standard ARIA attributes (`aria-expanded`, `aria-controls`) to correctly communicate state to assistive technologies.
