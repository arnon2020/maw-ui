# LFS-010 Static Mode + Viewport Fit Report

## Outcome

Implemented Static Mode on the real `maw-ui` fork. It is ON by default, can be forced with `?static=1` (or disabled with `?static=0`), persists via `localStorage["maw-static-mode"]`, and has a fixed toggle available on every HTML entrypoint. Motion Mode restores the original behavior.

Static Mode preserves every view and control while stopping continuous graphics: CSS animation/transition is globally disabled, WebGL/canvas scenes render one frame and redraw on interaction, FPS/joystick idle loops stop, and terminal thumbnails fetch one frame instead of polling. Data-correctness polling, WebSocket reconnects, sound fades, and one-shot layout rAF calls remain active by design.

AMENDMENT 1 is included: all 17 HTML entrypoints use `viewport-fit=cover`; dvh, safe-area, mobile input sizing, contained horizontal navigation, responsive sidebars, preview sizing, and keyboard-height fit were added without redesigning pages.

## Motion audit

The complete occurrence manifests are:

- `ψ/lab/LFS-010/runtime-motion-audit.txt` — rAF, interval, capture, and recursive polling sites.
- `ψ/lab/LFS-010/css-motion-audit.txt` — all 56 source files containing keyframes, animations, or transitions, with exact line numbers.

| Source | Motion type | Cost before | Static Mode handling |
|---|---|---:|---|
| `src/components/UniverseBg.tsx:107-115` | Three.js universe rAF | Continuous 24 fps WebGL | Render one still frame; resize remains interactive |
| `src/apps/federation.tsx:567` | Three.js, OrbitControls, bloom, particles | Continuous WebGL/effects loop | One frame; controls/data/selection explicitly redraw |
| `src/components/federation/Canvas2D.tsx:124-132` | Federation 2D canvas | Continuous rAF | One frame; store, drag, pan, wheel, resize redraw |
| `arena.html:770` | Three.js agents/mixers/server blink | Continuous rAF | One positioned still frame; WebSocket changes redraw once |
| `src/components/FpsCounter.tsx:23-25` | FPS meter | Continuous rAF plus React update | Disabled; displays `static` |
| `src/components/Joystick.tsx:33-35` | Mission joystick | Continuous idle rAF | No idle loop; pointer movement directly pans |
| `src/components/OverviewGrid.tsx:70-74` | Live capture tiles | Fetch every 2 s per visible tile | One frame per mount/open |
| `src/components/HoverPreviewCard.tsx:157-164` | Hover/pinned terminal preview | Fetch every 2 s | One frame when opened |
| `src/components/MiniMonitor.tsx:65-97` | Busy/hover mini terminals | Fetch every 0.5-1 s | Initial still frame; recurring effect not mounted |
| `src/components/VSAgentPanel.tsx:31-38` | VS terminal panels | Fetch every 300 ms | Immediate single frame |
| `src/components/iPadDashboard.tsx:132-137` | Tablet terminal panel | Fetch every 1.5 s | Immediate single frame; one-shot tail scroll retained |
| `src/components/AgentRow.tsx:33` | Elapsed label | React render every 1 s | Frozen between real agent updates |
| `src/index.css` plus 56-file manifest | keyframes, Tailwind `animate-*`, transitions | Continuous CSS compositor/paint | `html.static-mode *` globally forces none |
| `shrine.html:346`, federation/session/dashboard/status intervals | API status/data polling | Periodic, correctness-related | Retained so data does not become stale |
| `talk.html:285,370,387`, chat/Mission one-shot rAF | fit/scroll/layout after interaction | One-shot only | Retained; not an idle loop |
| `src/lib/sounds.ts:75` | Audio fade after user-triggered sound | Short interaction-only interval | Retained |

## Performance evidence

Chrome trace sample window: 2 seconds after a 3-second settle. `gpuRasterMs` sums Paint/RasterTask/GPUTask trace events. `energyProxy` is main-thread duty over the same window, not a hardware watt reading.

| Page | Mode | idle rAF | CSS running | Task ms | GPU/raster ms | Long tasks |
|---|---:|---:|---:|---:|---:|---:|
| Fleet | Static | 0 | 0 | 2140.693 | 135.637 | 3 |
| Fleet | Motion | 88 | 92 | 2382.298 | 357.860 | 2 |
| Office | Static | 0 | 0 | 791.576 | 6.954 | 0 |
| Office | Motion | 159 | 42 | 1140.435 | 170.237 | 0 |
| Mission | Static | 0 | 0 | 808.054 | 0.040 | 1 |
| Mission | Motion | 332 | 61 | 1218.875 | 231.401 | 1 |
| Federation 3D | Static | 0 | 0 | 8.577 | 0 | 0 |
| Federation 3D | Motion | 46 | 0 | 2110.390 | 1882.202 | 6 |

Fleet is subject to a busy live feed during trace collection, but continuous rAF and CSS animation still reached zero. Office task time fell 30.6%, Mission 33.7%, and Federation 99.6%; GPU/raster time fell 95.9%, 99.98%, and 100% respectively.

Under deterministic 6× CPU throttling on interactive Federation, scroll-to-next-frame median/p95 was 16.6/17.3 ms in Static Mode versus 38.5/47.4 ms in Motion Mode.

The thumbnail contract test observed four visible Overview targets for five seconds: Static made exactly 4 total capture requests (maximum 1/target), while Motion made 8 total (maximum 3/target).

Evidence: `ψ/lab/LFS-010/static-mode-performance.json` and `ψ/lab/LFS-010/static-mode-contracts.json`.

## Viewport-fit audit and evidence

All 17 HTML entrypoints now declare `width=device-width, initial-scale=1, viewport-fit=cover`; see `ψ/lab/LFS-010/viewport-meta-audit.txt`.

The automated matrix covered 360×800, 768×1024, 820×1180, and 844×390. It tested every HTML entrypoint plus ten main routes, with:

- 0 horizontal document overflow across every entry/profile.
- 44 screenshots: ten main routes plus Federation 3D for all four profiles, under `ψ/lab/LFS-010/screenshots/`.
- Chat composer visible at y-bottom 490 in a reduced 360×500 keyboard-open simulation.
- Static toggle visible and static class active on all tested main routes.

Evidence: `ψ/lab/LFS-010/viewport-verification.json`.

## FIX ROUND 1 — viewport-locked composers

Independent QA and the verifier confirmed the same bug at `9afcae1`: Chat grew the
document because both `#chat` and `chat.html` omitted the existing `fullHeight` shell
contract. The QA cold-load measurements put the composer below all four initial
viewports (894/800, 1094/1024, 1250/1180, and 460/390); focusing it first made the
browser scroll and masked the failure.

The fix applies `fullHeight` to both Chat entries and to standalone Inbox, changes
ChatView from a guessed `calc(100dvh - 48px)` height to a shrinking
`flex-1 min-h-0` child, and makes the Inbox list its own `overflow-y-auto` region.
The main document is now viewport-locked while the long thread or ask list scrolls
internally. `bottom-input-entry-audit.txt` also checks the equivalent full-height
Workspace and Talk composers plus the already-locked Terminal and Config entries.

Cold reload verification used the real 200-message feed (Chat thread scroll height
up to 81,901 px), measured before focus, focused the input, then reduced the viewport
to simulate the keyboard. Values below are composer bottom / viewport height; every
row also retained `documentHeight === viewportHeight` and `scrollY === 0`.

| Profile | Entry | Before focus | After keyboard |
|---|---|---:|---:|
| 360×800 | main `#chat` | 790/800 | 490/500 |
| 360×800 | `chat.html` | 790/800 | 490/500 |
| 360×800 | `workspace.html` | 788/800 | 488/500 |
| 360×800 | `talk.html` | 782.5/800 | 482.5/500 |
| 768×1024 | main `#chat` | 1014/1024 | 714/724 |
| 768×1024 | `chat.html` | 1014/1024 | 714/724 |
| 768×1024 | `workspace.html` | 1012/1024 | 712/724 |
| 768×1024 | `talk.html` | 1006.5/1024 | 706.5/724 |
| 820×1180 | main `#chat` | 1170/1180 | 870/880 |
| 820×1180 | `chat.html` | 1170/1180 | 870/880 |
| 820×1180 | `workspace.html` | 1168/1180 | 868/880 |
| 820×1180 | `talk.html` | 1162.5/1180 | 862.5/880 |
| 844×390 | main `#chat` | 380/390 | 290/300 |
| 844×390 | `chat.html` | 380/390 | 290/300 |
| 844×390 | `workspace.html` | 378/390 | 288/300 |
| 844×390 | `talk.html` | 372.5/390 | 282.5/300 |

Evidence: `ψ/lab/LFS-010/composer-fix-verification.json`, 32 before/keyboard
screenshots under `ψ/lab/LFS-010/composer-fix-screenshots/`, and
`ψ/lab/LFS-010/bottom-input-entry-audit.txt`.

## FIX ROUND 2 — unobstructed controls and VS viewport lock

Independent QA confirmed that the fixed `.maw-static-toggle` sat directly above the
Chat Send button and intercepted its center point in all four profiles, both before
and after the keyboard simulation. The toggle now docks into each entry's header as
a normal-flow control (with a compact mobile treatment) and redocks after React
replaces the route header. Its top-right fixed position is retained only as a
fallback when an entry has no header host. The five app-level floating controls were
also moved into the sticky status bar after the same-class audit found that their
fixed right edge could cover other interactive controls.

The audit also found the keyboard-only `#vs` route missing the shell's viewport-lock
contract. It now uses `fullHeight`, a shrinking/contained VS view, and fixed-size
composer rows. The Workspace composer was made responsive so its Send center remains
reachable beside its responsive sidebars.

The exhaustive hit-target harness covered 28 pages/routes × four profiles × two
phases (before focus and simulated keyboard): 224 states and 4,075 visible-control
center checks. Important controls had 0 blocked centers, fixed overlays blocked 0
centers, the Static/Motion toggle was visible and self-hit at its center in 224/224
states, and no state had horizontal document overflow.

VS bottom-input bounds below are input bottom / viewport height. Each state also had
`documentHeight === viewportHeight` and `scrollY === 0`.

| Profile | Before focus | After keyboard |
|---|---:|---:|
| 360×800 | 794/800 | 494/500 |
| 768×1024 | 1018/1024 | 718/724 |
| 820×1180 | 1174/1180 | 874/880 |
| 844×390 | 384/390 | 294/300 |

Evidence: `ψ/lab/LFS-010/interactive-hit-target-verification.json`,
`ψ/lab/LFS-010/hit-target-screenshots/`,
`ψ/lab/LFS-010/composer-fix-verification.json`, 40 before/keyboard screenshots
under `ψ/lab/LFS-010/composer-fix-screenshots/`, and the updated
`ψ/lab/LFS-010/bottom-input-entry-audit.txt`.

## Verification

- `npm run build`: pass.
- `npm test`: 146 pass, 0 fail.
- `npx tsc --noEmit`: pass.
- Static performance trace: pass; zero continuous idle rAF and zero running CSS animation on all four measured pages.
- Static flag/persistence/thumbnail contract: pass.
- Viewport matrix: pass; 44 screenshots, 0 horizontal page overflow, keyboard composer visible.
- Composer harness: pass; 40/40 before-focus and post-keyboard measurements visible
  across four profiles and five bottom-input entries, including `#vs`.
- Hit-target harness: pass; 224/224 states, 4,075 centers, 0 important controls
  blocked, 0 fixed-overlay obstructions, and toggle accessible in 224/224 states.
- `git diff --check`: pass.
- No backend source or state was changed. No preview/deploy was started; deployment remains assigned to lead after review.

branch: lfs-010-static-mode
commit: fbb1a3f
commands+exit-codes: npm run build=0, npm test=0, npx tsc --noEmit=0, node ψ/lab/LFS-010/verify-composer-fix.mjs=0, node ψ/lab/LFS-010/verify-interactive-hit-targets.mjs=0, git diff --check=0
files changed: public/static-mode.js; src/App.tsx; src/core/AppShell.tsx; src/apps/{chat,inbox,workspace}.tsx; src/components/{ChatView,VSAgentPanel,VSView}.tsx; ψ/lab/LFS-010/{LFS-010-STATIC-MODE-REPORT.md,bottom-input-entry-audit.txt,composer-fix-verification.json,interactive-hit-target-verification.json,verify-composer-fix.mjs,verify-interactive-hit-targets.mjs,composer-fix-screenshots/*,hit-target-screenshots/*}
verification: cold reload with live 200-message Chat thread, before-focus and post-keyboard bounds on four profiles × five bottom-input entries, exhaustive center hit-testing across 224 page/profile/phase states, 40 composer screenshots, production build, TypeScript check, and 146-test suite
Retro: Fixed/floating accessibility checks must use elementFromPoint at important-control centers across every responsive profile and keyboard phase; viewport geometry alone cannot reveal pointer interception.
FINAL-REPORT END
