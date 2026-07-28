# LFS-011 Fleet Grouping Report

## Outcome

Fleet now defaults to a session/room directory and can switch to a team directory.
Each group is independently collapsible, shows total agents plus busy/ready/idle/crashed
counts, and persists both the selected grouping mode and collapsed groups. Session
headings show the real tmux session alongside the friendly room/oracle label. Team
headings show the real team name and number of sessions represented; each member row
shows its `/api/teams` role and source room.

The mixed Recently Active section remains an explicitly labeled activity summary.
The authoritative directory beneath it is grouped; no agent is silently dropped.

## Team source and matching decision

`useSessions` already consumes the real `/api/teams` response through a REST fallback
and WebSocket `type: "teams"` updates, then passes `teams` into Fleet. The live
`/api/sessions` payload contains session/window names and status but no team annotation,
so this change does not invent an endpoint or infer a nonexistent payload field.

Team membership is resolved from `/api/teams.members`. Member `name` is the role
identifier exposed by that API. Duplicate role names exist in stale/concurrent team
records (for example `verifier`), so matching prefers:

1. exact team-name to session-name;
2. exact member cwd;
3. the team with the highest membership overlap in the agent's session;
4. an alive/newer team record as the deterministic fallback.

This correctly assigned all ten live `lucifer-fullstack-v1` members in `113-lucifer`
instead of misassigning its `verifier` to a newer research team.

Session is the default because it matches the user's room mental model. Team view is a
separate projection, allowing a team to span sessions without moving or duplicating an
agent. Agents with no resolved membership appear in `Standalone` and retain a `room:`
badge.

## UX and persistence

- Group-by Session/Team is an accessible pressed-state control.
- Session cards show session name plus friendly room name.
- Team cards show team name and represented-session count.
- Rows show `team · role:<member>` in session view and `room:<session>` in team view.
- Headers wrap on 360 px instead of creating horizontal document overflow.
- Group cards are individually keyboard-toggleable and sticky while their rows scroll.
- Collapse keys are namespaced by projection (`fleet:session:*`, `fleet:team:*`).
- Zustand UI-state version 4 persists `fleetGroupMode`.
- A slow initial `/api/ui-state` response can no longer overwrite a preference changed
  while that response is in flight; server sync now uses the current persistence version.
- No animation or recurring rendering work was added.

## Verification

The live browser matrix exercised both projections on four required profiles and
captured eight screenshots:

| Profile | Session groups | Team/standalone groups | Role badges | Horizontal overflow | Static idle rAF / animations |
|---|---:|---:|---:|---:|---:|
| 360×800 | 9 | 4 | 32 | 0 px | 0 / 0 |
| 768×1024 | 9 | 4 | 32 | 0 px | 0 / 0 |
| 820×1180 | 9 | 4 | 32 | 0 px | 0 / 0 |
| 844×390 | 9 | 4 | 32 | 0 px | 0 / 0 |

The recorded live source contained 10 sessions and 5 `/api/teams` records during the
final run. Team membership changed while verification was running, and the UI continued
to update from the live source.

Preference verification:

- Empty local state plus an empty server preference defaults to Session.
- Team selection persisted through a real reload.
- A live eight-row team collapsed to zero rows and remained at zero after reload.

Pure tests cover the required edge cases: one session with multiple teams, a team
spanning sessions, an unteamed standalone agent, an empty fleet, duplicate role records,
and session-density disambiguation. The full suite is 153 passing tests: 146 upstream
plus 7 new grouping tests.

Evidence:

- `ψ/lab/LFS-011/fleet-grouping-verification.json`
- `ψ/lab/LFS-011/verify-fleet-grouping.mjs`
- `ψ/lab/LFS-011/screenshots/` (four profiles × session/team)

No backend source or state mutation was required for the feature. Verification used
the live read APIs and the existing UI-preference persistence endpoint.

branch: lfs-011-fleet-grouping
commit: 521804e
commands+exit-codes: npm test=0 (153 pass), npm run build=0, npx tsc --noEmit=0, node ψ/lab/LFS-011/verify-fleet-grouping.mjs=0, git diff --check=0
files changed: src/components/{AgentRow,FleetGrid}.tsx; src/lib/{fleetGrouping.ts,fleetGrouping.test.ts,store.ts}; ψ/lab/LFS-011/{LFS-011-FLEET-GROUPING-REPORT.md,fleet-grouping-verification.json,verify-fleet-grouping.mjs,screenshots/*}
verification: live 4-profile session/team matrix with 8 screenshots, zero horizontal overflow, static idle rAF/animations 0/0, default/switch/collapse persistence, 7 edge-case unit tests, 146 upstream tests, production build, and TypeScript check
Retro: Team member names are not globally unique across historical team records; session-wide membership overlap is a stronger real-data discriminator than newest-record-wins alone.
FINAL-REPORT END
