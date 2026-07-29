# LFS-014-NETWORK-RESILIENCE

## Result

Critical REST state now survives a mobile network-interface change. UI-state writes remain pending in localStorage until a successful response, stale in-flight writes are aborted when a newer value supersedes them, and `online`/visible recovery coalesces into one write-and-refresh cycle. Retry is limited to network-class failures with delays of 500 ms, 1.5 s, and 4 s; HTTP responses and deliberate aborts are not retried.

`POST /api/send` uses a stricter policy because it is non-idempotent: an ambiguous failure that starts online is never retried. One retry is permitted only when the browser was already offline before attempt one, which proves that attempt could not leave the device. A final failure remains visible through the existing SummonPanel error result.

The StatusBar shows a small `offline` or `syncing…` badge only while degraded. It adds no timer or animation.

## Implementation

- Added `src/lib/fetchWithRetry.ts`: shared finite retry helper, abort-aware delay, network-error classifier, and per-call safety policy.
- Added `src/lib/networkStatus.ts`: shared online/retrying/offline state for unobtrusive UI feedback.
- Reworked `src/lib/store.ts` UI-state persistence:
  - latest state is written locally immediately and mirrored to `maw.ui-state.pending`;
  - pending data survives reload and is cleared only after a successful 2xx POST;
  - a new state aborts the older client request/backoff;
  - initial GET cannot overwrite a newer local value;
  - `online` and visible `visibilitychange` events coalesce while recovery is active;
  - no polling was added.
- Migrated the named critical calls: UI-state GET/POST, sessions GET, teams GET, asks GET/POST, capture GET, and send/wake dispatch.
- Added eight unit tests plus a Playwright/tmux acceptance harness.

## REST audit

The requested `fetch(apiUrl` audit was run across all TypeScript/TSX source.

### Migrated to the shared helper

| Endpoint | Location | Policy |
|---|---|---|
| `/api/ui-state` GET/POST | `src/lib/store.ts` | finite network retry; POST is replace-state and keeps durable pending data |
| `/api/sessions` GET | `src/components/DashboardPro.tsx` | finite network retry |
| `/api/teams` GET | `src/hooks/useSessions.ts` | finite network retry |
| `/api/asks` GET/POST | `src/lib/store.ts` | finite network retry; POST replaces the asks collection |
| `/api/capture` GET | `src/lib/captureStore.ts` | finite 250/750 ms retry, preserving its existing in-flight deduplication |
| `/api/send` POST | `src/lib/summonAgent.ts` | at most one retry, only if attempt one started offline; never retries ambiguous online/interface-change delivery |
| `/api/wake` POST | `src/lib/summonAgent.ts` | finite network retry; wake is convergent |

### Audited and intentionally not auto-retried

- Optional/read-only views keep their existing route-owned refresh lifecycle: `/api/config`, `/api/fleet-config`, `/api/feed`, `/api/plugins`, `/api/federation/status`, `/api/costs`, `/api/oracle/traces`, `/api/oracle/search`, `/api/pin-info`, `/api/config-files`, `/api/config-file`, `/api/teams/costs`, `/api/worktrees`, and `/api/oracles`. These are not part of the named critical live/session-state contract, and several already refresh on their owning view lifecycle.
- User-triggered mutations remain one-shot because automatic replay is unsafe without backend idempotency keys: `/api/action`, feed POST, PIN set/verify, config-file writes/toggle/delete, wake/sleep controls in DashboardPro, team delete/purge, worktree cleanup, and file attach.
- Peer proxy/exec clients do not match `fetch(apiUrl` and retain their separate connection/session semantics.

No backend file was changed.

## Acceptance evidence

Primary machine-readable evidence: `ψ/lab/LFS-014/network-resilience-verification.json`

Mobile screenshot: `ψ/lab/LFS-014/screenshots/mobile-pending-retry.png`

The Playwright run at 390×844 proved:

- a failed UI-state write left both the selected Team grouping and the latest serialized state intact in localStorage/pending storage;
- real browser offline mode showed the `offline` badge;
- returning online plus a simultaneous visibility event produced exactly one immediate recovery write containing the latest value, cleared pending storage, then cleared the badge;
- a permanently failed request stopped after four attempts with measured gaps 502/1502/4003 ms and stayed quiet for the following two-second window;
- an ambiguous `/api/send` failure made one request and delivered zero bytes;
- a deliberate subsequent send delivered exactly one `4b` byte followed by `0d` to a disposable raw tmux pane;
- Static Mode had zero retry requests during idle and zero running animations.

Existing regression harnesses also passed:

- Static Mode: all static Fleet/Office/Mission/Federation samples had zero rAF callbacks and zero running CSS animations.
- Viewport/touch: 360×800, 768×1024, 820×1180, and 844×390 passed across the route/entrypoint matrix; 44 screenshots were captured and the mobile keyboard/key bar remained visible.
- Unit suite: 164 pass, 0 fail (156 baseline + 8 retry tests).
- TypeScript and production build passed.

## Reproduction

```text
node ψ/lab/LFS-014/verify-network-resilience.mjs
node ψ/lab/LFS-010/verify-static-mode.mjs
node ψ/lab/LFS-010/verify-viewport.mjs
npx tsc --noEmit
npm test
npm run build
git diff --check
```

branch: lfs-014-network-resilience
commit: a001c9b
commands+exit-codes: node ψ/lab/LFS-014/verify-network-resilience.mjs=0, node ψ/lab/LFS-010/verify-static-mode.mjs=0, node ψ/lab/LFS-010/verify-viewport.mjs=0, npx tsc --noEmit=0, npm test=0, npm run build=0, git diff --check=0
files changed: src/lib/fetchWithRetry.ts, src/lib/fetchWithRetry.test.ts, src/lib/networkStatus.ts, src/lib/store.ts, src/lib/summonAgent.ts, src/lib/captureStore.ts, src/hooks/useSessions.ts, src/components/DashboardPro.tsx, src/components/StatusBar.tsx, ψ/lab/LFS-014/verify-network-resilience.mjs, ψ/lab/LFS-014/network-resilience-verification.json, ψ/lab/LFS-014/screenshots/mobile-pending-retry.png, ψ/lab/LFS-014/LFS-014-NETWORK-RESILIENCE-REPORT.md
verification: Browser offline→online recovery and latest-value proof, bounded-backoff request log, disposable-pane byte proof, Static Mode performance, viewport/touch matrix, 164 tests, TypeScript, production build
Retro: Coalescing only events from the same JavaScript task was insufficient; the browser's real online event can race a later visibility event, so the recovery guard must remain held until the entire write-and-refresh cycle completes.
FINAL-REPORT END
