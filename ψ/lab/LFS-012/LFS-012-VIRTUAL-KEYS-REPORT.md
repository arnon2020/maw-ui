# LFS-012-VIRTUAL-KEYS — Final report

Result: PASS. Terminal page/modal now have touch-safe virtual controls and tmux-backed scrollback; the real terminal remains live in Static Mode; capture previews refresh on events without idle polling; Fleet rows have quick keys and mobile grouping is immediately visible.

## What changed

- Added a shared 48px virtual-key bar: Esc, Tab, left/up/down/right, Ctrl+C, Enter, History/Live, and Keyboard.
- Ported the proven maw-ui-lite tmux SGR wheel algorithm. Touch swipe and History enter tmux copy mode; Live/Esc exits copy mode and returns to current output.
- Integrated controls into both the full terminal page and terminal modal, with visual-viewport refitting and viewport-contained flex layouts.
- Replaced TerminalView's finite capture snapshot with XTerminal (`/ws/pty` replay + live PTY bytes). Static Mode disables cursor blinking only and never gates `term.write`.
- Added a shared capture store with a finite coalesced refresh burst after input/activity, direct preview-WebSocket updates, and manual refresh controls. Static Mode has no recurring capture polling.
- Migrated OverviewGrid, HoverPreviewCard, MiniMonitor, MiniPreview, VSAgentPanel, and iPadDashboard preview surfaces to this event-driven path.
- Fixed Enter execution semantics in HoverPreviewCard and VSAgentPanel by sending the command followed by CR.
- Added Esc/arrow/Enter quick keys to every active Fleet AgentRow, covering both Recently Active and session/team grouped rows.
- On narrow screens, moved Group by + room cards before Stage/Recent; the first mobile visit collapses Recent by default while preserving subsequent user state. Desktop order remains unchanged.

## Root-cause confirmation

The stale real-terminal issue was confirmed: TerminalView rendered a finite `/api/capture` result instead of the live PTY terminal. Separately, capture-only thumbnails became stale because LFS-010 correctly removed polling in Static Mode but left no event refresh path. These are now separate, explicit contracts:

1. XTerminal always consumes live PTY bytes.
2. Preview captures refresh only for mount, user input, WebSocket activity, or manual refresh; idle Static Mode remains quiet.

## Terminal key and scrollback proof

- Disposable target: `lfs012-vkeys:0`.
- All eight keys reached the actual disposable PTY with exact bytes:
  `1b 09 1b 5b 44 1b 5b 41 1b 5b 42 1b 5b 43 03 0d`.
- `seq 1 500`: History entered `pane_in_mode=1` and exposed early output; Live returned to `pane_in_mode=0` and showed the tail.
- Synthetic touch swipe entered copy mode through the same SGR-wheel path; Esc returned to live.
- Evidence: `virtual-keys-verification.json` and `screenshots/history-copy-mode.png`.

## Terminal page/modal profile matrix

Each state tested ten controls. Center hit-test, minimum 48px target, bar visibility, horizontal containment, viewport lock, keyboard focus, and zero idle Static rAF/animations all passed.

| Profile | Surface | Before keyboard: bar / viewport | Keyboard: bar / viewport | Center hits |
|---|---|---:|---:|---:|
| 360×800 | page | 722–787 / 800 | 422–487 / 500 | 20/20 |
| 360×800 | modal | 735–800 / 800 | 435–500 / 500 | 20/20 |
| 390×844 | page | 766–831 / 844 | 466–531 / 544 | 20/20 |
| 390×844 | modal | 779–844 / 844 | 479–544 / 544 | 20/20 |
| 768×1024 | page | 946–1011 / 1024 | 646–711 / 724 | 20/20 |
| 768×1024 | modal | 959–1024 / 1024 | 659–724 / 724 | 20/20 |
| 844×390 | page | 312–377 / 390 | 222–287 / 300 | 20/20 |
| 844×390 | modal | 325–390 / 390 | 235–300 / 300 | 20/20 |

Totals: 16/16 states viewport-contained, 160/160 center hits, 160/160 minimum targets, 16/16 idle Static rAF checks, and 16/16 animation checks.

## Live/event-driven proof

All mutations used disposable sessions.

- Static real terminal: `echo LFS012_LIVE_OK` became visible through XTerminal in 65ms and was present in pane capture.
- The input action produced a finite capture burst; after settling, a two-second idle window recorded zero `/api/capture` requests.
- Fleet preview: the disposable pane was changed out-of-band, then Fleet Enter triggered refresh and the new marker became visible in 167ms.
- Fleet action produced two finite capture requests; manual refresh produced one request; the following idle window produced zero requests.
- The backend intentionally rejects control input to a disposable non-Claude bash pane. Fleet key delivery was therefore verified safely at the exact outgoing `/ws` frame boundary: Esc, left, up, down, right, and Enter sequences all matched.
- Evidence: `event-refresh-verification.json`.

## Fleet acceptance

- Fleet quick-key center hit-tests: 24/24 (six keys × four profiles), all at least 48×48 and self-hit.
- On 390×844, Group by is at y=239–289 and the first room header at y=306–403, visible in the initial viewport without scrolling.
- On 360×800, Group by is at y=276–326 and the first room header at y=343–440.
- Screenshot: `screenshots/fleet-390-group-first.png`.
- Both Recently Active and grouped session/team entries reuse AgentRow, so the same quick-key component is present in both paths.

## Final verification

- TypeScript: pass.
- Tests: 155 pass, 0 fail (153 inherited + 2 terminal-input tests).
- Production build: pass.
- `git diff --check`: pass.
- Verification harnesses: both pass.
- No real user PTY was sent test input; no preview/deployed server on port 4174 was modified.

branch: lfs-012-virtual-keys
commit: eb817d2, 5be46d8
commands+exit-codes: node ψ/lab/LFS-012/verify-virtual-keys.mjs=0, node ψ/lab/LFS-012/verify-event-refresh.mjs=0, npx tsc --noEmit=0, npm test=0, npm run build=0, git diff --check=0
files changed: src/components/AgentRow.tsx, src/components/FleetGrid.tsx, src/components/HoverPreviewCard.tsx, src/components/MiniMonitor.tsx, src/components/MiniPreview.tsx, src/components/OverviewGrid.tsx, src/components/TerminalKeyBar.tsx, src/components/TerminalModal.tsx, src/components/TerminalView.tsx, src/components/VSAgentPanel.tsx, src/components/XTerminal.tsx, src/components/iPadDashboard.tsx, src/hooks/useSessions.ts, src/hooks/useWebSocket.ts, src/lib/captureStore.ts, src/lib/terminalInput.ts, src/lib/terminalInput.test.ts, ψ/lab/LFS-012/*
verification: disposable PTY exact-byte and tmux copy-mode proof; 16-state terminal viewport/keyboard matrix with 160 center hit-tests; 4-profile Fleet matrix with 24 center hit-tests; live/event/manual/idle network proof; TypeScript, 155 tests, production build, diff check
Retro: Removing polling needs an explicit freshness contract: live PTY surfaces should remain streaming, while snapshot previews need finite refresh triggers for input, upstream activity, and manual action. Also, the main WebSocket intentionally rejects disposable non-Claude panes, so safe Fleet control verification should pair exact outgoing-frame proof with an out-of-band disposable-pane mutation to validate preview refresh.
FINAL-REPORT END
