# maw-ui-lite contributor instructions

## Project identity

This repository is `arnon2020/maw-ui-lite`, a modified fork of
`Soul-Brews-Studio/maw-ui`. The UI retains the upstream **ARRA Office** product
name while adding Static Mode, responsive phone/tablet behavior, Fleet
room/team grouping, and terminal touch controls.

## License and attribution

- Preserve `LICENSE` exactly. The upstream work is licensed under Business
  Source License 1.1 by Nat Weerawan (ณัฐ วีระวรรณ์).
- Keep the upstream fork attribution and permitted-use summary visible in
  `README.md`.
- Do not describe this fork as independently originated or remove upstream
  copyright/provenance.

## Repository rules

- Work on a task branch; do not commit directly to `main`.
- Preserve unrelated user changes in a dirty worktree.
- Do not rewrite existing `ψ/lab/*` records. They are historical evidence.
  A task may add its own new report only when its brief explicitly requires it.
- Keep the user-facing **ARRA Office** header unchanged unless a task explicitly
  changes the product branding.
- Treat `maw-ui-dist.tar.gz` as an upstream compatibility filename, not the
  repository's current identity.
- Do not commit secrets, generated authentication state, `node_modules`, or
  local browser/runtime artifacts.

## Stack and verification

- React 19, TypeScript, Vite, Tailwind CSS, Zustand, xterm.js, and Three.js.
- Run `npm test`, `npm run build`, and `npx tsc --noEmit` for code or package
  changes.
- Run `git diff --check` before committing.
- Verify responsive changes at phone, tablet, and landscape sizes.
- Verify Static Mode changes with continuous idle rAF/CSS motion checks while
  ensuring WebSocket data and PTY output remain live.

## Key behavior

- Static Mode is on by default, can be forced with `?static=1`, disabled with
  `?static=0`, and persists under `maw-static-mode`.
- Fleet supports Session/room and Team projections.
- Writable terminals own the virtual-key bar and tmux History/Live controls;
  read-only capture previews do not show terminal keys.
- Vite preview expects a maw-js backend on port 3456 unless
  `VITE_MAW_URL` selects another backend.
