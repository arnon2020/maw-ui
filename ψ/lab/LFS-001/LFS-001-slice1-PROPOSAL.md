# LFS-001 S1b — Focused Summon Proposal

This update narrows the prior assessment to Nat's three targets: easier end-to-end use, faster agent selection, and automatic registry synchronization. It is based on the dirty-main source, the existing UI at `http://localhost:5173/#overview`, and the installed `maw-js` backend serving port 3456.

## Backend investigation

### What `/api/config` reads

- Vite proxies `/api/config` from port 5173 to `maw serve` on port 3456.
- The backend handler returns `configForDisplay()`, which calls `loadConfig()`.
- `loadConfig()` reads layered JSON configuration: weighted `~/.config/maw/maw.config.<weight>[.local].json` files, legacy `~/.config/maw/maw.config.json` when no weighted global file exists, and applicable project `.maw/maw.config.*.json` layers.
- During a fresh config load, fleet windows from the state-first `~/.maw/fleet/*.json` directory and legacy `~/.config/maw/fleet/*.json` directory are merged into `config.agents`.
- `loadConfig()` is cached in the long-running backend process. A normal GET returns that cache. `saveConfig()` clears it, and `POST /api/config/reload` explicitly clears it; `maw bud` calls that reload endpoint after writing a fleet file.
- `/api/config` does **not** read the oracle-registry cache `~/.maw/oracles.json`. The backend's unified `OracleManifest` is the broader inventory: it merges fleet windows, `config.sessions`, `config.agents`, `oracles.json`, and worktree discovery.

### Verified inventory gap

The current `/api/config` response contained:

- 29 canonical names derived by the current frontend algorithm (`sessions` plus `commands` ending in `-oracle`).
- 85 raw `config.agents` keys, which normalize to 54 canonical names.
- 25 canonical `config.agents` names omitted by the current frontend algorithm.

The unified `maw oracle ls --json --stale` manifest reported 56 canonical oracles. Therefore, merely refetching the existing frontend logic cannot fully synchronize the picker: it must consume at least `config.agents`, and exact parity with the oracle registry requires a typed unified-manifest list.

### WS/SSE availability

- Existing WebSocket routes are `/ws`, `/ws/pty`, and `/ws/tmux`.
- `/ws` currently emits session, recent-agent, feed, preview/capture, and team updates. No `config-changed`, `registry-changed`, or config-version event is emitted.
- No config-related SSE endpoint exists. The only SSE use found in maw-ui is unrelated BoB state.
- Consequently, there is no existing config-change stream the Summon panel can subscribe to today.

## Target 1: Make the end-to-end Summon flow easier

- Current (verified): Clicking a quick-choice agent selects it and focuses the task textarea. Empty-task Wake transitions through “Waking agent...” to “Wake sent”; filled-task Start transitions through “Starting task...” to “Task queued” and clears the textarea. Validation and backend errors appear in the panel. However, the action labels do not include the selected agent, numbered chips imply nonexistent shortcuts, and global result text can remain after the awakened agent disappears and selection advances to another target.
- Proposed: Present a clear three-part flow—Choose agent → optionally enter task → “Wake <agent>” or “Start task on <agent>”. Make numbered shortcuts real only while the picker has focus, announce progress/results, and bind each result to the acted-on agent so automatic selection cannot misattribute it.
- Effort: M
- Risk: Medium — global shortcuts can trigger an unintended selection/action if their focus scope is wrong. Restrict shortcuts to the open/focused picker, never bind the action itself to a bare number, and keep Wake/Start as explicit activation.
- Category: UX / Correctness / A11y

## Target 2: Select any agent quickly, beyond the 12-chip limit

- Current (verified): The live panel showed 25 summonable agents. `SUMMON_VISIBLE_LIMIT = 12` and `dormantAgents.slice(0, 12)` expose only the first 12 alphabetical agents as quick choices; the rest require scanning an unsearchable native select. At 390 px wide, the 12 wrapping chips also make the panel roughly 530 px tall.
- Proposed: Replace the native select with an accessible typeahead combobox over the full normalized registry list. Support fuzzy filtering, arrow-key navigation, and Enter selection. Show a compact recent/pinned row above results, keep an explicit “All agents” path, and remove the hard alphabetical quick-choice cutoff (or use virtualization if the registry grows substantially).
- Effort: M
- Risk: Medium — ranking can make uncommon agents feel hidden, and fuzzy matching can select similarly named agents. Always display the exact canonical target, preserve an alphabetical “All” mode, highlight the matched substring, and require explicit Enter/click selection before Wake/Start.
- Category: UX / A11y / Visual

## Target 3: Automatically synchronize with the oracle registry

- Current (verified): `OverviewGrid` fetches `/api/config` only on mount (`useEffect(..., [])`), silently keeps an empty/old list on failure, and ignores `config.agents`. The backend GET is also cached until reset/reload. There is no WS/SSE config-change event, so frontend polling or panel-open refetch alone can still receive stale backend data.
- Proposed (recommended mechanism: WebSocket event): Add a typed canonical oracle list (preferably from the unified `OracleManifest`) and a monotonically changing registry/config version to the backend API. Whenever config/fleet/registry writers invalidate their caches, emit `registry-changed` on the existing `/ws`. The frontend should fetch once, refetch on that event, normalize aliases, subtract live agents, and preserve the last good list while a refresh is pending. For older servers or a missed event, use a low-frequency visibility-aware retry with exponential backoff; show “List may be stale” plus Retry after failures.
- Effort: L
- Risk: High — this spans maw-js and maw-ui, and missed invalidation points could create false freshness. Centralize cache invalidation plus broadcast in one backend function, include a version in both event and GET response, ignore out-of-order responses, retain last-known-good data, and add compatibility fallback from unified names → `config.agents` → legacy `sessions`/`commands`.
- Category: Correctness / UX

## Recommendation order

1. Target 3 first: establish a complete, fresh canonical list.
2. Target 2 next: build fast selection on that trustworthy list.
3. Target 1 last: polish actions, shortcuts, and target-specific feedback on the finalized picker.
