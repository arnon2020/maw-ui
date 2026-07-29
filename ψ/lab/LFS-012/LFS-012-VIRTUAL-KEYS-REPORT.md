# LFS-012 — FIX ROUNDS 1–3 final report

Result: PASS.

## User correction implemented

- Removed the Esc/arrow/Enter bars from every Fleet `AgentRow`. `AgentRow.tsx` is now identical to the grouped-Fleet baseline (`0a144b7`) for this concern.
- FIX ROUND 1 now applies grouped-first Fleet ordering to every viewport below 1024px, including tablets and 844px landscape; wide desktop order remains unchanged.
- Stage and Recently Active default collapsed on every compact viewport without a first-visit/session-storage gate, so returning users receive the same layout.
- Moved key-bar ownership to writable `XTerminal`. `TerminalView` and `TerminalModal` are the only two `XTerminal` consumers, and neither can omit the bar.
- All App entry routes that select an agent (Fleet, Office, Overview, Mission, Teams, Orbital, and others using `onSelectAgent`) converge on the same `TerminalModal`, so they inherit the same XTerminal-owned controls.

## Terminal controls

The horizontally scrollable, 48px-minimum touch bar now contains:

- Sticky Ctrl and Alt modifiers with pressed state.
- Esc, Tab, left/up/down/right.
- Home, End, PgUp, PgDn.
- Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L, Ctrl+R.
- `/`, `|`, Enter.
- History/Live and Keyboard.

Sticky Ctrl/Alt apply terminal-correct modified navigation/text sequences and remain active until explicitly toggled off. The bar stays inside the viewport at the bottom of the writable terminal, immediately above the mobile keyboard/accessory region.

## Ownership and preview boundary

Source audit:

- Writable PTY terminal: `XTerminal` owns and renders `TerminalKeyBar`.
- Full Terminal page: mounts `XTerminal` and supplies its text-input accessory.
- Agent modal: mounts the same `XTerminal`; no duplicate modal-specific bar is needed.
- Capture previews (`MiniMonitor`, `MiniPreview`, cards/panels using `/api/capture`) are read-only snapshots, do not mount `XTerminal`, and intentionally do not show terminal keys.
- Fleet rows contain neither `data-fleet-key` nor `data-fleet-key-bar`.

## Exact byte proof per writable surface

Both the Terminal page and Terminal modal sent this full stream to separate disposable raw PTYs, with expected bytes exactly matching observed bytes:

`Esc Tab Left Up Down Right Home End PgUp PgDn Ctrl+C Ctrl+D Ctrl+Z Ctrl+L Ctrl+R / | Enter Ctrl+Up×2 Alt+Left×2`

Both surface proofs passed, including the sticky-state check across repeated modified keys. Full expected/actual hex and pane captures are in `virtual-keys-verification.json`.

## Real terminal workflow proof

Each required profile executed real shell workflows through the Terminal page:

| Profile | Typing | Ctrl+C | Up history | Tab completion |
|---|---:|---:|---:|---:|
| 360×800 | pass | pass | pass | pass |
| 390×844 | pass | pass | pass | pass |
| 768×1024 | pass | pass | pass | pass |
| 844×390 | pass | pass | pass | pass |

Scrollback separately passed all six state checks: History entered tmux copy mode, early output became visible, Live returned to the tail, swipe entered copy mode, and Esc returned live.

Workflow screenshots:

- `screenshots/mobile-360x800-terminal-workflow.png`
- `screenshots/mobile-390x844-terminal-workflow.png`
- `screenshots/tablet-768x1024-terminal-workflow.png`
- `screenshots/landscape-844x390-terminal-workflow.png`

## Responsive page/modal matrix

Four profiles × two writable surfaces × before/after keyboard = 16 states:

- 352/352 center hit-tests passed.
- 352/352 controls met the 48×48 minimum.
- 16/16 key bars stayed visible.
- 16/16 states stayed viewport-locked with no document horizontal overflow.
- 16/16 keyboard focus checks passed.
- 16/16 Static Mode idle-rAF and animation checks passed.

Screenshots for every state are under `ψ/lab/LFS-012/screenshots/`.

## Fleet and refresh acceptance

- Fleet verification found 0 terminal key buttons and 0 terminal key bars in all five compact profiles.
- Computed CSS order passed at 360×800, 390×844, 768×1024, 820×1180, and 844×390:
  directory=1, Stage=2; Group by=1, first room=2, Recently Active=3.
- Stage and Recently Active both reported `aria-expanded=false` by default in all five profiles.
- Group by and the first room header were visible in the initial viewport in all five profiles. First-room top positions were 343px, 306px, 254px, 221px, and 221px respectively.
- Evidence screenshots: `screenshots/{mobile-360x800,mobile-390x844,tablet-768x1024,tablet-820x1180,landscape-844x390}-fleet-group-first.png`.
- Static live terminal output arrived in 69ms.
- Explicit preview refresh arrived in 71ms.
- Both terminal and preview capture paths settled to zero idle capture requests.

## Final verification

- `node ψ/lab/LFS-012/verify-virtual-keys.mjs`: pass.
- `node ψ/lab/LFS-012/verify-event-refresh.mjs`: pass.
- `npx tsc --noEmit`: pass.
- `npm test`: 156 pass, 0 fail.
- `npm run build`: pass.
- `git diff --check`: pass.

branch: lfs-012-virtual-keys
commit: e9cd12e6a915e015d64ff6ecec996036ebff60f6, 46d8b0424a72e160aaed367736276673c58972e9
commands+exit-codes: node ψ/lab/LFS-012/verify-virtual-keys.mjs=0, node ψ/lab/LFS-012/verify-event-refresh.mjs=0, npx tsc --noEmit=0, npm test=0, npm run build=0, git diff --check=0
files changed: src/components/AgentRow.tsx, src/components/FleetGrid.tsx, src/components/TerminalKeyBar.tsx, src/components/TerminalView.tsx, src/components/XTerminal.tsx, src/lib/terminalInput.ts, src/lib/terminalInput.test.ts, ψ/lab/LFS-012/verify-virtual-keys.mjs, ψ/lab/LFS-012/verify-event-refresh.mjs, ψ/lab/LFS-012/virtual-keys-verification.json, ψ/lab/LFS-012/event-refresh-verification.json, ψ/lab/LFS-012/screenshots/*
verification: separate disposable-PTY byte proof for Terminal page and modal; real typing/Ctrl+C/history/Tab workflows at four terminal profiles; 16-state responsive page/modal matrix; tmux scrollback proof; five-profile Fleet computed-order/default-collapse/first-viewport/zero-key matrix; TypeScript/tests/build/diff checks
Retro: Responsive product behavior needs an explicit breakpoint contract and computed-style evidence. A one-time storage migration is not a reliable UI default for returning users, and `sm` was too narrow for a compact layout intended to include tablets.
FINAL-REPORT END
