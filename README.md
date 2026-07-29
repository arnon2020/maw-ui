# maw-ui-lite

The full maw-ui fleet console, tuned to stay still at idle and fit phones and
tablets.

`maw-ui-lite` is a fork of
[Soul-Brews-Studio/maw-ui](https://github.com/Soul-Brews-Studio/maw-ui). It
keeps the upstream ARRA Office experience and maw-js integration while adding
Static Mode, responsive viewport work, room/team Fleet grouping, and
touch-friendly live terminals.

## What is different from upstream?

| Area | maw-ui-lite behavior | Verified result |
|---|---|---|
| Static Mode | On by default. Continuous CSS motion and idle canvas/WebGL loops stop; live data, terminal bytes, reconnects, and interaction redraws continue. | 0 continuous idle `requestAnimationFrame` callbacks and 0 running CSS animations on all four measured views. |
| Interaction performance | Static scenes redraw only when data or interaction requires it. | Under 6× CPU throttling, Federation scroll-to-next-frame p95 improved from 47.4 ms in Motion Mode to 17.3 ms in Static Mode. |
| Mobile/tablet fit | All 17 HTML entrypoints use `viewport-fit=cover`, dynamic viewport sizing, safe areas, contained navigation, and keyboard-aware composers. | Four responsive profiles passed with no horizontal page overflow; the extended control audit covered 224 states and 4,075 control centers. |
| Fleet grouping | Fleet defaults to real tmux session/room groups and can switch to teams resolved from `/api/teams`. Groups, mode, and collapsed state persist. | The four-profile matrix showed 9 session groups and 4 team/standalone groups in its recorded live dataset, with 0 px horizontal overflow. |
| Terminal controls | Writable terminals provide 48×48-minimum virtual keys, sticky Ctrl/Alt, common control sequences, keyboard access, and tmux History/Live scrollback. | 352/352 responsive hit-target checks passed; exact PTY bytes and real typing, Ctrl+C, history, Tab completion, swipe scrollback, and live return were verified. |
| Initial load | Existing views remain available through Vite's multi-page and split-chunk build. | The documented lite baseline was approximately 12 KB gzip, below the project's 70 KB gzip budget. Chunk sizes vary as views evolve; use the current `vite build` output for release decisions. |

The measurements above come from the committed LFS-010, LFS-011, and LFS-012
reports in `ψ/lab/`. Those files are historical verification records and should
not be rewritten.

## Run locally

You need Node.js, npm, and a reachable
[maw-js](https://github.com/Soul-Brews-Studio/maw-js) backend (normally
`http://localhost:3456`).

```sh
npm install
npm run build
npx vite preview --host --port 4174
```

Open `http://localhost:4174/`. Preview proxies `/api` and `/ws` to the maw-js
backend. To point the UI at another node, use `?host=<maw-js-url>`.

For development with hot reload:

```sh
npm run dev
```

## Static Mode

Static Mode is enabled by default and persists in
`localStorage["maw-static-mode"]`.

- Use the **Static ON / Motion ON** control in the header to switch modes.
- Add `?static=0` to disable Static Mode for that URL.
- Add `?static=1` to force Static Mode for that URL.

Static Mode stops decorative and continuously rendered motion. It does not
freeze WebSocket data, API correctness refreshes, live PTY output, reconnection,
or one-shot layout work.

## Main views

The ARRA Office header and product name are intentionally retained from
upstream.

| View | Route | What it shows |
|---|---|---|
| Office | `index.html#office` | Rooms and agents with status and terminal access |
| Mission | `index.html#mission` | Active work, tasks, and progress |
| Dashboard | `index.html#dashboard` | Fleet metrics and health |
| Fleet | `index.html#fleet` | Session/room or team-grouped fleet directory |
| Overview | `index.html#overview` | Dense agent overview and Summon |
| Terminal | `index.html#terminal` | Live writable xterm.js terminal with virtual keys and tmux scrollback |
| Chat | `index.html#chat` | Cross-agent messaging |
| Teams | `index.html#teams` | Team membership and roles |
| Federation | `index.html#federation` | Oracle list grouped by node, peer latency, and reachability |
| Config | `index.html#config` | Fleet configuration viewer |
| Federation 2D | `federation_2d.html` | Interactive canvas federation graph |
| Federation 3D | `federation.html` | Three.js federation view with controls and effects |
| Inbox | `inbox.html` | Oracle inbox, questions, and handoffs |
| Workspace | `workspace.html` | Multi-agent workspace and actions |

Federation 2D is still present in this repository: it remains a Vite build
entry and a linked header destination.

## Architecture

- **State:** Zustand stores for agent, terminal preview, Fleet, and UI
  preferences.
- **Data:** maw-js REST endpoints plus live `/ws` and `/ws/pty` connections.
- **Routing:** Vite multi-page entries and hash-based ARRA Office views;
  `?host=<peer>` selects a maw-js node.
- **Static control:** `public/static-mode.js` initializes the mode before the
  app renders; React consumers use `src/lib/staticMode.ts`.
- **Build:** Vite emits independent entrypoints and shared chunks. The
  `maw-ui-dist.tar.gz` release filename is retained for compatibility with
  upstream `maw ui` tooling.

## Upstream and license

This project is a modified fork—not an independently originated replacement—of
[Soul-Brews-Studio/maw-ui](https://github.com/Soul-Brews-Studio/maw-ui), created
by Nat Weerawan (ณัฐ วีระวรรณ์). The upstream licensed work and this derivative
are governed by the included [Business Source License 1.1](LICENSE).

The license's Additional Use Grant permits non-commercial, personal,
educational, and internal business use. Uses outside the current license grant
may require an alternative commercial license from the licensor. The included
license names a Change Date of 2040-04-07 and Apache License 2.0 as the Change
License; consult the full `LICENSE` text for the controlling terms.

The original `LICENSE` is preserved without modification. Fork branding does
not remove the upstream copyright, provenance, or license obligations.
