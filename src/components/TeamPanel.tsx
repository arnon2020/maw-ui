import { memo, useState } from "react";
import { apiUrl } from "../lib/api";

export interface TeamMember {
  name: string;
  color: string | null;
  backendType: string | null;
  isActive: boolean | null;
  tmuxPaneId: string;
  model: string;
  cwd?: string;
  agentType?: string;
  joinedAt?: number;
}

export interface Team {
  name: string;
  description: string;
  members: TeamMember[];
  createdAt?: number;
  alive?: boolean;
  lastActivity?: number;
}

interface Task {
  id: string;
  subject: string;
  status: string;
  owner: string | null;
}

export const COLOR_MAP: Record<string, string> = {
  blue: "#60a5fa",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#facc15",
  purple: "#c084fc",
  cyan: "#22d3ee",
  orange: "#fb923c",
  pink: "#f472b6",
};

const PURGE_DAYS = 30;

function shortModel(raw?: string): string {
  if (!raw) return "?";
  const m = raw.replace(/\[.*\]$/, ""); // strip [1m] suffix
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m === "inherit") return "inherit";
  return m.split("-").pop() || m; // fallback: last segment
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cwdShort(cwd?: string): string {
  if (!cwd) return "";
  const parts = cwd.split("/");
  // Show last 2 parts: org/repo
  return parts.slice(-2).join("/");
}

function MemberRow({ m, isLast, onOpen }: { m: TeamMember; isLast: boolean; onOpen?: (name: string) => void }) {
  const color = COLOR_MAP[m.color || ""] || "#888";
  const model = shortModel(m.model);
  return (
    <div className="px-6 py-3 flex items-center gap-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: isLast ? "none" : undefined }}>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      {onOpen ? (
        <button
          onClick={() => onOpen(m.name)}
          className="text-[13px] font-mono text-white/70 hover:text-cyan-300 hover:underline cursor-pointer"
          style={{ background: "none", border: "none", padding: 0 }}
          title={`Open ${m.name} in terminal`}
        >
          {m.name}
        </button>
      ) : (
        <span className="text-[13px] font-mono text-white/70">{m.name}</span>
      )}
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
        {model}
      </span>
      {m.agentType && m.agentType !== "general-purpose" && m.agentType !== "team-lead" && (
        <span className="text-[10px] font-mono text-white/20">{m.agentType}</span>
      )}
      {m.backendType && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-auto" style={{
          background: m.backendType === "tmux" ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.04)",
          color: m.backendType === "tmux" ? "#22d3ee" : "#555"
        }}>
          {m.backendType === "in-process" ? "in-proc" : m.backendType}
        </span>
      )}
    </div>
  );
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="px-6 py-4 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
      <div className="text-[10px] font-mono text-white/25 uppercase tracking-[2px] mb-1">Tasks</div>
      {tasks.map(t => (
        <div key={t.id} className="flex items-center gap-3 text-[12px] font-mono">
          <span className="w-4 text-center flex-shrink-0">
            {t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : "⬜"}
          </span>
          <span className={`flex-1 truncate ${t.status === "completed" ? "text-white/25 line-through" : "text-white/60"}`}>
            {t.subject}
          </span>
          {t.owner && (
            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)", color: "#666" }}>
              @{t.owner}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamCard({ team, tasks: teamTasks, onOpenAgent }: { team: Team; tasks: Task[]; onOpenAgent?: (name: string) => void }) {
  const done = teamTasks.filter(t => t.status === "completed").length;
  const total = teamTasks.length;
  const lead = team.members.find(m => m.name === "team-lead" || m.agentType === "team-lead");
  const teammates = team.members.filter(m => m !== lead);

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: "#12121c",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-start gap-4" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-[3px] uppercase text-cyan-400">{team.name}</span>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            {total > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md" style={{
                background: done === total ? "rgba(74,222,128,0.12)" : "rgba(250,204,21,0.12)",
                color: done === total ? "#4ade80" : "#facc15"
              }}>
                {done}/{total} tasks
              </span>
            )}
          </div>
          {team.description && (
            <div className="text-[12px] text-white/40 font-mono leading-relaxed truncate">{team.description}</div>
          )}
          <div className="flex items-center gap-3 mt-1">
            {team.createdAt && (
              <span className="text-[10px] text-white/20 font-mono">created {timeAgo(team.createdAt)}</span>
            )}
            {team.lastActivity ? (
              <span className="text-[10px] text-white/25 font-mono">active {timeAgo(team.lastActivity)}</span>
            ) : null}
            {lead?.cwd && (
              <span className="text-[10px] text-white/15 font-mono truncate">{cwdShort(lead.cwd)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-white/30 font-mono">{team.members.length}</span>
          <div className="flex -space-x-2">
            {team.members.slice(0, 5).map(m => {
              const color = COLOR_MAP[m.color || ""] || "#555";
              return (
                <div key={m.name} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2"
                  style={{ background: `${color}25`, borderColor: "#12121c", color }}
                  title={m.name}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              );
            })}
            {team.members.length > 5 && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-mono border-2"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "#12121c", color: "#666" }}>
                +{team.members.length - 5}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lead */}
      {lead && (
        <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(96,165,250,0.03)" }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#60a5fa", boxShadow: "0 0 6px #60a5fa" }} />
          <span className="text-[13px] font-mono font-semibold text-white/70">team-lead</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
            {shortModel(lead.model)}
          </span>
          <span className="text-[10px] text-white/15 font-mono ml-auto">lead</span>
        </div>
      )}

      {/* Teammates */}
      {teammates.length > 0 && (
        <div className="flex flex-col">
          {teammates.map((m, i) => (
            <MemberRow key={m.name} m={m} isLast={i === teammates.length - 1} onOpen={onOpenAgent} />
          ))}
        </div>
      )}

      {/* Tasks */}
      {teamTasks.length > 0 && <TaskList tasks={teamTasks} />}
    </div>
  );
}

function StaleRow({ team, tasks, expanded, onToggle, deleteState, onAskDelete, onConfirmDelete, onCancelDelete }: {
  team: Team;
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  deleteState: "idle" | "confirm" | "busy";
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const lastSeen = team.lastActivity || team.createdAt;
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center min-w-0" style={{ background: expanded ? "rgba(255,255,255,0.03)" : "none" }}>
        <button
          onClick={onToggle}
          className="flex-1 px-5 py-2.5 flex items-center gap-3 font-mono min-w-0 cursor-pointer text-left"
          style={{ background: "none", border: "none" }}
          title={expanded ? "Collapse" : "Expand team structure"}
        >
          <span className="text-[9px] text-white/30 flex-shrink-0 w-3 transition-transform duration-150" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
            ▶
          </span>
          <span className="text-[13px] text-white/60 uppercase tracking-[1px] flex-shrink-0" title={team.name}>{team.name}</span>
          {team.description && (
            <span className="text-[11px] text-white/40 truncate min-w-0" title={team.description}>{team.description}</span>
          )}
          <span className="text-[11px] text-white/40 ml-auto flex-shrink-0">
            {team.members.length > 0 ? `${team.members.length} agent${team.members.length > 1 ? "s" : ""}` : ""}
          </span>
          {lastSeen && (
            <span className="text-[11px] text-white/35 flex-shrink-0 w-16 text-right" title={team.lastActivity ? "last activity" : "created"}>
              {timeAgo(lastSeen)}
            </span>
          )}
        </button>
        <div className="pr-4 flex-shrink-0 flex items-center gap-2 font-mono">
          {deleteState === "confirm" ? (
            <>
              <button
                onClick={onConfirmDelete}
                className="text-[10px] px-2 py-1 rounded-md cursor-pointer"
                style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}
              >
                move to trash
              </button>
              <button
                onClick={onCancelDelete}
                className="text-[10px] px-2 py-1 rounded-md cursor-pointer text-white/40"
                style={{ background: "rgba(255,255,255,0.05)", border: "none" }}
              >
                cancel
              </button>
            </>
          ) : deleteState === "busy" ? (
            <span className="text-[10px] text-white/30">deleting…</span>
          ) : (
            <button
              onClick={onAskDelete}
              className="text-[11px] px-1.5 py-0.5 rounded cursor-pointer"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
              title="Delete team (moves to trash)"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Expanded: team structure */}
      {expanded && (
        <div className="flex flex-col" style={{ background: "rgba(255,255,255,0.015)" }}>
          {team.description && (
            <div className="px-6 pt-3 pb-1 text-[12px] text-white/45 font-mono leading-relaxed">{team.description}</div>
          )}
          {(team.createdAt || team.lastActivity) && (
            <div className="px-6 pb-2 flex items-center gap-3 font-mono">
              {team.createdAt && <span className="text-[10px] text-white/25">created {timeAgo(team.createdAt)}</span>}
              {team.lastActivity ? <span className="text-[10px] text-white/25">last activity {timeAgo(team.lastActivity)}</span> : null}
            </div>
          )}
          {team.members.length > 0 ? (
            team.members.map((m, i) => (
              <MemberRow key={m.name} m={m} isLast={i === team.members.length - 1 && tasks.length === 0} />
            ))
          ) : (
            <div className="px-6 py-3 text-[11px] text-white/30 font-mono" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              no member data recorded for this team
            </div>
          )}
          {tasks.length > 0 && <TaskList tasks={tasks} />}
        </div>
      )}
    </div>
  );
}

export const TeamPanel = memo(function TeamPanel({ teams: teamsRaw, onOpenAgent }: { teams?: Team[]; onOpenAgent?: (name: string) => void }) {
  // Derive tasks from team data (tasks come embedded in team config)
  const teams = teamsRaw || [];
  const tasks: Record<string, Task[]> = {};
  for (const team of teams) {
    tasks[team.name] = (team as any).tasks || [];
  }

  // Locally hidden after a successful delete — WS teams broadcast catches up shortly after
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Purge flow: idle → candidates listed (dry run) → busy
  const [purgeCandidates, setPurgeCandidates] = useState<string[] | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);

  const visible = teams.filter(t => !removed.has(t.name));
  const active = visible.filter(t => t.alive !== false);
  const stale = [...visible.filter(t => t.alive === false)].sort(
    (a, b) => (b.lastActivity || b.createdAt || 0) - (a.lastActivity || a.createdAt || 0)
  );
  // Stale list defaults open when there is nothing active to look at
  const [staleToggle, setStaleToggle] = useState<boolean | null>(null);
  const staleOpen = staleToggle ?? active.length === 0;
  const [expandedStale, setExpandedStale] = useState<Set<string>>(new Set());

  const toggleStaleTeam = (name: string) => {
    setExpandedStale(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const deleteTeam = async (name: string) => {
    setConfirmDelete(null);
    setBusyDelete(name);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/teams/${encodeURIComponent(name)}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `delete failed (${res.status})`);
      setRemoved(prev => new Set(prev).add(name));
    } catch (e) {
      setError(`${name}: ${e instanceof Error ? e.message : "delete failed"}`);
    } finally {
      setBusyDelete(null);
    }
  };

  const askPurge = async () => {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/teams/purge?olderThanDays=${PURGE_DAYS}&dryRun=1`), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `purge check failed (${res.status})`);
      setPurgeCandidates(data.candidates || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "purge check failed");
    }
  };

  const confirmPurge = async () => {
    setPurgeBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/teams/purge?olderThanDays=${PURGE_DAYS}`), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `purge failed (${res.status})`);
      setRemoved(prev => {
        const next = new Set(prev);
        for (const n of data.purged || []) next.add(n);
        return next;
      });
      setPurgeCandidates(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "purge failed");
    } finally {
      setPurgeBusy(false);
    }
  };

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12" style={{ minHeight: "calc(100vh - 120px)" }}>
        <div className="text-4xl opacity-20">🤖</div>
        <div className="text-white/30 font-mono text-sm text-center">
          No active teams
        </div>
        <div className="text-white/15 font-mono text-xs text-center max-w-sm">
          Use <span className="text-cyan-400/50">TeamCreate</span> in Claude Code to spawn a team, or <span className="text-cyan-400/50">maw team create</span> from CLI
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 p-6 overflow-y-auto" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-xs font-mono text-white/30">
          {active.length} active
        </span>
        {stale.length > 0 && (
          <>
            <span className="text-xs font-mono text-white/20">·</span>
            <span className="text-xs font-mono text-white/15">{stale.length} stale</span>
          </>
        )}
        <span className="text-xs font-mono text-white/20">·</span>
        <span className="text-xs font-mono text-white/30">{visible.reduce((n, t) => n + t.members.length, 0)} agents</span>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-[12px] font-mono flex items-center gap-3"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer text-white/40" style={{ background: "none", border: "none" }}>✕</button>
        </div>
      )}

      {/* Active teams: full cards */}
      {active.map(team => (
        <TeamCard key={team.name} team={team} tasks={tasks[team.name] || []} onOpenAgent={onOpenAgent} />
      ))}

      {/* Nothing running right now */}
      {active.length === 0 && (
        <div className="rounded-2xl px-6 py-5 flex items-center gap-4" style={{ background: "#12121c", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-2xl opacity-30">🤖</span>
          <div className="flex flex-col gap-1 font-mono">
            <span className="text-[13px] text-white/60">No teams running right now</span>
            <span className="text-[11px] text-white/35">
              Use <span className="text-cyan-400/70">TeamCreate</span> in Claude Code or <span className="text-cyan-400/70">maw team create</span> from CLI
            </span>
          </div>
        </div>
      )}

      {/* Stale teams: compact history, expandable per team */}
      {stale.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#12121c", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center" style={{ background: "rgba(255,255,255,0.02)" }}>
            <button
              onClick={() => setStaleToggle(!staleOpen)}
              className="flex-1 px-5 py-3.5 flex items-center gap-3 font-mono cursor-pointer text-left"
              style={{ background: "none", border: "none" }}
            >
              <span className="text-[11px] text-white/50 uppercase tracking-[2px]">Stale teams</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md text-white/40" style={{ background: "rgba(255,255,255,0.05)" }}>
                {stale.length}
              </span>
              <span className="text-[10px] text-white/25 ml-auto transition-transform duration-200" style={{ transform: staleOpen ? "rotate(180deg)" : "none" }}>
                ▼
              </span>
            </button>
            {purgeCandidates === null && (
              <button
                onClick={askPurge}
                className="mr-4 flex-shrink-0 text-[10px] font-mono px-2.5 py-1 rounded-md cursor-pointer text-white/40"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                title={`Move stale teams older than ${PURGE_DAYS} days to trash`}
              >
                purge &gt;{PURGE_DAYS}d
              </button>
            )}
          </div>

          {/* Purge confirm strip */}
          {purgeCandidates !== null && (
            <div className="px-5 py-3 flex items-center gap-3 font-mono flex-wrap"
              style={{ background: "rgba(248,113,113,0.05)", borderTop: "1px solid rgba(248,113,113,0.15)" }}>
              {purgeCandidates.length === 0 ? (
                <>
                  <span className="text-[11px] text-white/40">nothing older than {PURGE_DAYS}d to purge</span>
                  <button onClick={() => setPurgeCandidates(null)} className="text-[10px] px-2 py-1 rounded-md cursor-pointer text-white/40 ml-auto"
                    style={{ background: "rgba(255,255,255,0.05)", border: "none" }}>ok</button>
                </>
              ) : (
                <>
                  <span className="text-[11px]" style={{ color: "#f87171" }}>
                    move {purgeCandidates.length} team{purgeCandidates.length > 1 ? "s" : ""} to trash:
                  </span>
                  <span className="text-[10px] text-white/40 truncate" style={{ maxWidth: "50%" }} title={purgeCandidates.join(", ")}>
                    {purgeCandidates.join(", ")}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <button
                      onClick={confirmPurge}
                      disabled={purgeBusy}
                      className="text-[10px] px-2.5 py-1 rounded-md cursor-pointer"
                      style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", opacity: purgeBusy ? 0.5 : 1 }}
                    >
                      {purgeBusy ? "purging…" : `purge ${purgeCandidates.length}`}
                    </button>
                    <button
                      onClick={() => setPurgeCandidates(null)}
                      disabled={purgeBusy}
                      className="text-[10px] px-2 py-1 rounded-md cursor-pointer text-white/40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "none" }}
                    >
                      cancel
                    </button>
                  </span>
                </>
              )}
            </div>
          )}

          {staleOpen && stale.map(team => (
            <StaleRow
              key={team.name}
              team={team}
              tasks={tasks[team.name] || []}
              expanded={expandedStale.has(team.name)}
              onToggle={() => toggleStaleTeam(team.name)}
              deleteState={busyDelete === team.name ? "busy" : confirmDelete === team.name ? "confirm" : "idle"}
              onAskDelete={() => setConfirmDelete(team.name)}
              onConfirmDelete={() => deleteTeam(team.name)}
              onCancelDelete={() => setConfirmDelete(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
});
