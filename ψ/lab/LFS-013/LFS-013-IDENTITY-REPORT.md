# LFS-013 Identity Report

## Outcome

Re-established the repository identity as `maw-ui-lite` without obscuring its
upstream origin.

- Rewrote README around the actual fork: upstream ARRA Office plus Static Mode,
  mobile/tablet fit, session/team Fleet grouping, terminal virtual keys, and
  tmux scrollback.
- Included verified LFS-010–012 results: zero continuous idle rAF/CSS
  animations, 47.4 ms to 17.3 ms Federation p95, responsive matrices, Fleet
  grouping counts, and terminal hit-target/PTY proofs.
- Corrected the build-size wording so the requested approximately 12 KB gzip
  number is identified as a documented lite baseline; the fresh build is the
  authority for current release chunks.
- Documented build and `vite preview --host --port 4174` usage, Static/Motion
  toggle behavior, `?static=0`, `?static=1`, and all current primary views.
- Verified Federation 2D still exists in the Vite inputs and header navigation,
  so it remains in the views table.
- Changed package identity in `package.json`, `package-lock.json`, and
  `bun.lock`.
- Replaced stale coder-specific `AGENTS.md` content with repository instructions
  for maw-ui-lite.
- Updated user-visible disconnected/peer guidance and the renamed checkout path
  in the inbox service.

## License and history safeguards

- `LICENSE` was not edited. Its SHA-256 remains
  `cadfe319eb11a6b539a0383861c48b5e5fa574ba1fbeb3746435c23bb3c24a40`.
- README conspicuously identifies the project as a modified fork of
  `Soul-Brews-Studio/maw-ui`, names Nat Weerawan, links upstream, identifies
  Business Source License 1.1, and summarizes the Additional Use Grant.
- No existing `ψ/lab/*` file was modified. This LFS-013 report is the only new
  lab artifact.
- A pre-existing unstaged `package-lock.json` change adding `bun-types` was
  preserved and excluded from the identity commit; only the two package-name
  lines were staged from that file.

## Verification

- `npm test`: exit 0; 156 passed, 0 failed, 367 assertions.
- `npm run build`: exit 0; 183 modules transformed.
- `npx tsc --noEmit`: exit 0.
- `git diff --cached --check`: exit 0 before the implementation commit.
- Preview smoke: requested port 4174 was already occupied, so Vite selected
  4175; `/` served the retained `ARRA Office` title and `static-mode.js`
  exposed Static/Motion controls. The temporary 4175 process was then stopped.
- Package identity assertion: `package.json`, the root `package-lock.json`
  name, and its workspace name all equal `maw-ui-lite`.
- Source check: Federation 2D remains both a Vite input and a header link.

branch: lfs-013-identity
commit: d5471331a7a44b0dfcd88be8f6ca7d3b4d2f6516 (identity implementation); HEAD adds this report
commands+exit-codes: git switch -c lfs-013-identity main=0, npm test=0, npm run build=0, npx tsc --noEmit=0, npx vite preview --host --port 4174=0 (served on fallback 4175), curl preview/static-mode smoke=0, git diff --cached --check=0, git commit=0
files changed: README.md, AGENTS.md, package.json, package-lock.json (name lines only), bun.lock, scripts/maw-inbox-detector.service, src/components/ConnectPage.tsx, src/lib/peerConnection.ts, src/lib/peerConnectionBanner.ts, src/lib/peerExecClient.test.ts, src/lib/peerProxyClient.ts, ψ/lab/LFS-013/LFS-013-IDENTITY-REPORT.md
verification: 156/156 tests passed; production build and TypeScript passed; package names agree; preview smoke passed; LICENSE hash unchanged; no existing ψ/lab history changed
Retro: Identity work needs both provenance and source-of-truth checks: the brief said 2D might be removed, but current Vite/navigation source proved it remains; partial staging also prevented an unrelated dirty lockfile update from entering the commit.
FINAL-REPORT END
