# LFS-012 checkpoint — 2026-07-29

Status: implementation is substantially complete; final cross-profile and event-refresh verification is still in progress. This is a WIP checkpoint, not DONE.

## Completed implementation

- Added a shared terminal virtual-key bar with 48×48 minimum targets: Esc, Tab, arrows, Ctrl+C, Enter, History/Live, and Keyboard.
- Ported the proven maw-ui-lite touch scrollback approach into React: vertical touch swipes are translated to tmux SGR mouse-wheel sequences; History enters copy mode and Live sends Escape and returns to the bottom.
- Integrated the bar into the full terminal page and terminal modal. The modal/page use viewport-constrained flex layouts and the xterm surface refits after visual viewport/keyboard changes.
- Replaced the terminal page's stale capture-only output with `XTerminal`, using `/ws/pty` replay plus live PTY bytes. Static Mode only disables cursor blinking; it does not gate `term.write`, so the real terminal stays live.
- Added a shared event-driven capture store. Capture surfaces refresh on terminal input, `/ws` send activity, preview WebSocket activity, and a manual refresh button. Static Mode does not poll continuously; motion mode retains the existing polling behavior.
- Migrated capture consumers in OverviewGrid, HoverPreviewCard, MiniMonitor, MiniPreview, VSAgentPanel, and iPadDashboard to the shared store.
- Added Fleet quick keys (Esc, arrows, Enter) to every active AgentRow, covering both recent rows and grouped session/team rows.
- Reordered Fleet mobile layout so group controls and the first grouped room appear before Stage/Recent content. Recent is collapsed by default only on the first mobile visit and remains user-toggleable.
- Added unit coverage for terminal key sequences and tmux SGR mouse-wheel encoding.

## Verification completed

- `npx tsc --noEmit` passed.
- `npm test` passed: 155 tests, 0 failures (153 inherited + 2 new).
- `git diff --check` passed.
- Disposable PTY byte proof for the terminal bar passed exactly:
  `1b 09 1b 5b 44 1b 5b 41 1b 5b 42 1b 5b 43 03 0d`.
- The first full profile matrix produced 160/160 successful center hit-tests and minimum target-size checks across terminal page/modal, four profiles, before/after keyboard simulation.
- Manual History/Live proof entered tmux copy mode, exposed earlier output, then returned to live mode.
- Manual responsive inspection confirmed the mobile xterm canvas is constrained inside its output region rather than keeping the old 840px height.

## Remaining before DONE

1. Stabilize and rerun `ψ/lab/LFS-012/verify-virtual-keys.mjs`. Its implementation checks passed, but the long run later lost/failed to reopen the disposable target while opening the Fleet-driven modal. Change the modal helper to wait for an attached Fullscreen control and force-click it because the pinned preview can be clipped below the landscape viewport; keep all PTY targets disposable.
2. Add/run a focused event-refresh harness:
   - Static ON: terminal command output appears in live XTerminal after Enter.
   - Fleet Enter/send triggers a finite capture refresh and preview update within 2 seconds.
   - Preview WebSocket activity updates shared capture state.
   - Manual refresh works.
   - After settling, idle static mode produces no recurring capture requests and no recurring rAF loop.
3. Verify Fleet quick-key center hit-tests and exact PTY bytes at all four profiles; verify group control + first room are initially visible on mobile.
4. Rerun typecheck, tests, build, and diff check after the final harness adjustment.
5. Write the final report, commit final verification artifacts/fixes, push normally, and send DONE to lead.

## Files currently changed

- `src/components/AgentRow.tsx`
- `src/components/FleetGrid.tsx`
- `src/components/HoverPreviewCard.tsx`
- `src/components/MiniMonitor.tsx`
- `src/components/MiniPreview.tsx`
- `src/components/OverviewGrid.tsx`
- `src/components/TerminalKeyBar.tsx` (new)
- `src/components/TerminalModal.tsx`
- `src/components/TerminalView.tsx`
- `src/components/VSAgentPanel.tsx`
- `src/components/XTerminal.tsx`
- `src/components/iPadDashboard.tsx`
- `src/hooks/useSessions.ts`
- `src/hooks/useWebSocket.ts`
- `src/lib/captureStore.ts` (new)
- `src/lib/terminalInput.ts` (new)
- `src/lib/terminalInput.test.ts` (new)
- `ψ/lab/LFS-012/verify-virtual-keys.mjs` (new WIP verification harness)
- `ψ/lab/LFS-012/virtual-keys-verification.json` and screenshots (current artifacts from an incomplete/failed long run; replace with successful final output)

## Important findings and caveats

- The stale real terminal cause is now confirmed in the page implementation: TerminalView displayed a finite `/api/capture` snapshot instead of the live PTY component. The fix is architectural: use XTerminal for the actual surface and never let Static Mode gate PTY writes.
- Preview staleness had a separate but related cause: Static Mode intentionally stopped polling, leaving capture-only thumbnails with no refresh trigger. The fix keeps Static Mode quiet at idle while refreshing on input/activity/manual events.
- The backend `/ws` capture path currently hardcodes an 80-line capture despite a requested line count. `/ws/pty` replay is therefore required for the actual terminal's retained history.
- The first verification harness failure was partly a test-helper issue: it required the pinned preview's Fullscreen button to be visible, but landscape clipping can leave it attached below the viewport. Force-click the attached UI control for modal setup, then test the modal itself.
- Do not use the deployed preview on port 4174. The local Vite server for this branch is on port 5177.
- Never use a real user PTY for verification. Current disposable naming has used `lfs012-vkeys`; dedicated per-test target names are safer for the remaining harnesses.
- No force push or history rewrite.

branch: lfs-012-virtual-keys
checkpoint base: aa9dc985
checkpoint status: WIP commit pending immediately after this file is added
