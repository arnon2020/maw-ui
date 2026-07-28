# LFS-001 Slice 1 — Summon Button Assessment Proposal

Assessment basis: the dirty-main `OverviewGrid.tsx` Summon implementation and the already-running UI at `http://localhost:5173/#overview`. The live panel exposed 25 summonable agents, while the quick-choice area exposed only the first 12.

## Item 1: Replace the native dropdown with a searchable agent picker
- Current: Selecting one of 25 dormant agents requires scanning a long native dropdown by name; there is no filter or fuzzy search.
- Proposed: Use a typeahead combobox that filters as the user types, supports partial/fuzzy name matching, and keeps arrow-key/Enter selection.
- Effort: M
- Category: UX / A11y

## Item 2: Prioritize recent and pinned agents
- Current: Quick choices are the first 12 alphabetical dormant agents, so frequently summoned agents can fall outside the fast path and require the dropdown.
- Proposed: Rank quick choices by pinned agents first and recently/frequently summoned agents next, with alphabetical order as the fallback. Persist the small preference list locally.
- Effort: M
- Category: UX

## Item 3: Make numbered quick choices real keyboard shortcuts
- Current: Quick-choice chips display numbers 1–12, but the numbers are decorative; pressing them does not select an agent. This suggests a shortcut that does not exist.
- Proposed: Bind visible shortcut keys to their agents while the user is in the Summon panel, show a keyboard hint, and avoid intercepting keys while typing. If shortcuts are not implemented, remove the numbers.
- Effort: S
- Category: UX / A11y

## Item 4: Keep result feedback attached to the agent acted on
- Current: Success/error state is global to the panel. When a successfully awakened agent leaves the dormant list, selection automatically moves to another agent but the prior agent's “Wake sent” or task result remains visible.
- Proposed: Store the result with the acted-on target and show the agent name in feedback (for example, “Wake sent to atlas”). Clear or archive that feedback when automatic selection moves to a different agent.
- Effort: S
- Category: Correctness / UX

## Item 5: Expose the zero-summonable and config-failure states
- Current: When no dormant agents are available, the Summon panel disappears entirely and the summary omits the summonable count. A failed `/api/config` request is silently swallowed and produces the same result, so “everyone is live” and “agent discovery failed” are indistinguishable.
- Proposed: Show a compact “All configured agents are live” state for a valid empty result, and a distinct retryable “Could not load summonable agents” state when configuration loading fails.
- Effort: S
- Category: Correctness / UX

## Item 6: Add semantic labels and live status announcements
- Current: The agent `<select>` has no associated label, quick choices expose selection only through color, and waking/success/error feedback is not an ARIA live region.
- Proposed: Add visible or screen-reader labels, expose quick-chip selection with `aria-pressed` or an equivalent combobox pattern, and announce action progress/results with an appropriately polite live region.
- Effort: S
- Category: A11y

## Item 7: Preserve actionable error details
- Current: Feedback is truncated to 55% of the header width, so longer backend errors can lose the useful part. The only recovery is to infer that Wake or Start should be pressed again.
- Proposed: Allow error text to wrap or provide an expandable detail, retain the failed task text, and show a clear Retry action for the same agent/action.
- Effort: S
- Category: UX / Correctness

## Item 8: Reduce mobile selection height
- Current: At a 390 px viewport, the responsive panel is usable without horizontal overflow, but the select, textarea, action row, and 12 wrapping quick chips make the panel about 530 px tall before any agent tiles appear.
- Proposed: On narrow screens, use the searchable picker as the primary selector and collapse quick choices into a one-line horizontally scrollable recent/pinned row or an expandable section.
- Effort: S
- Category: Visual / UX
