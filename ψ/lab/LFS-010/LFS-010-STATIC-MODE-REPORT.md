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

## Verification

- `npm run build`: pass.
- `npm test`: 146 pass, 0 fail.
- Static performance trace: pass; zero continuous idle rAF and zero running CSS animation on all four measured pages.
- Static flag/persistence/thumbnail contract: pass.
- Viewport matrix: pass; 44 screenshots, 0 horizontal page overflow, keyboard composer visible.
- `git diff --check`: pass.
- No backend source or state was changed. No preview/deploy was started; deployment remains assigned to lead after review.

branch: lfs-010-static-mode
commit: 31280ebb3543803fae4d08c9757712b8068f329f
commands+exit-codes: npm run build=0, npm test=0, node ψ/lab/LFS-010/verify-static-mode.mjs=0, node ψ/lab/LFS-010/verify-static-contracts.mjs=0, node ψ/lab/LFS-010/verify-viewport.mjs=0, git diff --check=0
files changed: all 17 root HTML entrypoints; public/static-mode.js; src/lib/staticMode.ts; src/index.css; src/apps/{federation,workspace}.tsx; src/components/{AgentRow,ChatView,ConfigView,FpsCounter,HoverPreviewCard,Joystick,MiniMonitor,MissionControl,OverviewGrid,TerminalView,UniverseBg,VSAgentPanel,VSView,iPadDashboard,useMissionControl}.tsx; src/components/federation/{Canvas2D,Sidebar}.tsx; ψ/lab/LFS-010 audit, verification, JSON, and screenshot artifacts
verification: Chrome traces and request counters, 6× CPU interaction comparison, 17-entry/4-profile viewport matrix with 44 screenshots, production build, and upstream 146-test suite
Retro: A global CSS freeze is necessary but insufficient—canvas/WebGL loops and live terminal thumbnails must be independently made one-frame and interaction-driven, while correctness polling must remain live.
FINAL-REPORT END
