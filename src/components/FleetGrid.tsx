import { memo, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { HoverPreviewCard } from "./HoverPreviewCard";
import { MiniPreview } from "./MiniPreview";
import { StageSection } from "./StageSection";
import { FootballPitch } from "./FootballPitch";
import { AgentRow } from "./AgentRow";
import { roomStyle, PREVIEW_CARD, guessCommand } from "../lib/constants";
import { BottomStats } from "./BottomStats";
import { useFps } from "./FpsCounter";
import { useFleetStore, RECENT_TTL_MS, type RecentEntry } from "../lib/store";
import type { AgentState, Session, AgentEvent } from "../lib/types";
import { describeActivity, type FeedEvent } from "../lib/feed";
import type { Team } from "./TeamPanel";
import { COLOR_MAP } from "./TeamPanel";
import { buildFleetGroups } from "../lib/fleetGrouping";

export type FeedLogEntry = { text: string; ts: number; project?: string; eventType?: string };

/** Fleet-specific controls for StatusBar — reads from Zustand, takes agents for counts */
export function BroadcastModal({ agents, send, onClose }: { agents: AgentState[]; send: (msg: object) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [sent, setSent] = useState(false);
  const recRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeAgents = agents.filter(a => a.name !== "live" && a.name !== "zsh");

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { inputRef.current?.focus(); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "th-TH";
    rec.onresult = (e: any) => {
      let final = "", inter = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else inter += e.results[i][0].transcript;
      }
      if (final) setText(prev => (prev + " " + final).trim());
      setInterim(inter);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setTimeout(() => {
      try { rec.start(); setListening(true); } catch {}
      // Double-focus for mobile keyboard
      inputRef.current?.focus();
      setTimeout(() => { inputRef.current?.click(); inputRef.current?.focus(); }, 100);
    }, 300);
    return () => { try { rec.stop(); } catch {} };
  }, []);

  const toggleMic = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) { rec.stop(); setListening(false); }
    else { setInterim(""); rec.start(); setListening(true); }
  };

  const handleSend = () => {
    if (!text.trim()) return;
    if (recRef.current && listening) { recRef.current.stop(); setListening(false); }
    for (const a of activeAgents) {
      send({ type: "send", target: a.target, text: text.trim() });
      setTimeout(() => send({ type: "send", target: a.target, text: "\r" }), 50);
    }
    setSent(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="w-[90%] max-w-[560px] flex flex-col gap-4 rounded-3xl p-7" style={{ background: "rgba(13,13,24,0.9)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">📢</span>
          <span className="text-lg font-bold text-amber-400">Broadcast</span>
          <span className="text-xs text-white/30 font-mono">{activeAgents.length} agents</span>
          <button onClick={toggleMic} className="w-10 h-10 rounded-full flex items-center justify-center ml-2 cursor-pointer" style={{ background: listening ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.15)" }}>
            {listening ? "🔴" : "🎤"}
          </button>
          {listening && <span className="text-xs text-red-400/70">listening...</span>}
          <span className="ml-auto text-white/30 cursor-pointer text-xl" onClick={onClose}>×</span>
        </div>
        <textarea ref={inputRef} value={text + (interim ? " " + interim : "")} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === "Escape") onClose(); }}
          placeholder={listening ? "Speaking..." : "Message all agents..."}
          autoFocus inputMode="text" enterKeyHint="send"
          rows={4} className="w-full px-5 py-4 rounded-2xl text-lg text-white/90 outline-none resize-none"
          style={{ background: listening ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.04)", border: listening ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.08)" }} />
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/20">Enter = send · Shift+Enter = newline · Esc = close</span>
          <button onClick={handleSend} disabled={!text.trim() || sent}
            className="ml-auto px-6 py-3 rounded-xl font-semibold cursor-pointer"
            style={{ background: sent ? "rgba(74,222,128,0.15)" : text.trim() ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)", color: sent ? "#4ade80" : text.trim() ? "#fbbf24" : "rgba(255,255,255,0.15)", border: sent ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(251,191,36,0.2)" }}>
            {sent ? "✓ Sent!" : "📢 Broadcast"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FleetControls({ agents, send }: { agents: AgentState[]; send: (msg: object) => void }) {
  const { sortMode, setSortMode } = useFleetStore();
  const [showBroadcast, setShowBroadcast] = useState(false);
  const busyCount = agents.filter(a => a.status === "busy").length;
  const readyCount = agents.filter(a => a.status === "ready").length;
  const idleCount = agents.length - busyCount - readyCount;

  const wakeAll = () => {
    for (const a of agents) {
      if (a.status === "idle") send({ type: "wake", target: a.target, command: guessCommand(a.name) });
    }
  };
  const sleepAll = () => {
    if (!confirm("Sleep all busy agents?")) return;
    for (const a of agents) {
      if (a.status === "busy") send({ type: "sleep", target: a.target });
    }
  };

  return (
    <>
      {busyCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#ffa726] animate-pulse" />
          <span className="text-amber-400">{busyCount}</span>
        </span>
      )}
      <span className="flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-emerald-400">{readyCount}</span>
      </span>
      {idleCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="text-white/30">{idleCount}</span>
        </span>
      )}
      {idleCount > 0 && (
        <button className="px-2 py-1 text-[10px] font-mono font-bold rounded-md active:scale-95 transition-all whitespace-nowrap"
          style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
          onClick={wakeAll} title="Wake all idle agents">Wake</button>
      )}
      {busyCount > 0 && (
        <button className="px-2 py-1 text-[10px] font-mono font-bold rounded-md active:scale-95 transition-all whitespace-nowrap"
          style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
          onClick={sleepAll} title="Sleep all busy agents">Sleep</button>
      )}
      <button className="px-2 py-1 text-[10px] font-mono font-bold rounded-md active:scale-95 transition-all whitespace-nowrap"
        style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)" }}
        onClick={() => setShowBroadcast(true)} title="Broadcast to all agents">📢</button>
      <div className="flex items-center rounded-md overflow-hidden border border-white/[0.08]">
        <button className="px-2 py-0.5 text-[10px] font-mono transition-colors whitespace-nowrap"
          style={{ background: sortMode === "active" ? "rgba(251,191,36,0.15)" : "transparent", color: sortMode === "active" ? "#fbbf24" : "#64748B" }}
          onClick={() => setSortMode("active")}>Active</button>
        <button className="px-2 py-0.5 text-[10px] font-mono transition-colors whitespace-nowrap"
          style={{ background: sortMode === "name" ? "rgba(255,255,255,0.08)" : "transparent", color: sortMode === "name" ? "#E2E8F0" : "#64748B" }}
          onClick={() => setSortMode("name")}>Room</button>
      </div>
      {showBroadcast && <BroadcastModal agents={agents} send={send} onClose={() => setShowBroadcast(false)} />}
    </>
  );
}

interface FleetGridProps {
  sessions: Session[];
  agents: AgentState[];
  connected: boolean;
  send: (msg: object) => void;
  onSelectAgent: (agent: AgentState) => void;
  eventLog: AgentEvent[];
  addEvent: (target: string, type: AgentEvent["type"], detail: string) => void;
  feedActive?: Map<string, FeedEvent>;
  agentFeedLog?: Map<string, FeedEvent[]>;
  teams?: Team[];
}

/** Track visible agent targets via IntersectionObserver */
function useVisibleTargets(send: (msg: object) => void) {
  const visibleRef = useRef(new Set<string>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const syncToServer = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      send({ type: "subscribe-previews", targets: [...visibleRef.current] });
    }, 150);
  }, [send]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const target = (entry.target as HTMLElement).dataset.target;
          if (!target) continue;
          if (entry.isIntersecting) {
            if (!visibleRef.current.has(target)) { visibleRef.current.add(target); changed = true; }
          } else {
            if (visibleRef.current.has(target)) { visibleRef.current.delete(target); changed = true; }
          }
        }
        if (changed) syncToServer();
      },
      { rootMargin: "100px" }
    );
    return () => { observerRef.current?.disconnect(); clearTimeout(debounceRef.current); };
  }, [syncToServer]);

  const observe = useCallback((el: HTMLElement | null, target: string) => {
    if (!el || !observerRef.current) return;
    el.dataset.target = target;
    observerRef.current.observe(el);
  }, []);

  return observe;
}

function sortRooms(sessions: Session[], agentMap: Map<string, AgentState[]>, mode: "active" | "name") {
  return [...sessions].sort((a, b) => {
    if (mode === "active") {
      const aBusy = (agentMap.get(a.name) || []).filter(ag => ag.status === "busy").length;
      const bBusy = (agentMap.get(b.name) || []).filter(ag => ag.status === "busy").length;
      if (aBusy !== bBusy) return bBusy - aBusy;
      const aLen = (agentMap.get(a.name) || []).length;
      const bLen = (agentMap.get(b.name) || []).length;
      if (aLen !== bLen) return bLen - aLen;
    }
    return a.name.localeCompare(b.name);
  });
}

export const FleetGrid = memo(function FleetGrid({
  sessions, agents, connected, send, onSelectAgent, eventLog, addEvent, feedActive, agentFeedLog, teams,
}: FleetGridProps) {
  const fps = useFps();
  const observe = useVisibleTargets(send);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Zustand store ---
  const {
    recentMap, markBusy, pruneRecent, sortMode, setSortMode, fleetGroupMode, setFleetGroupMode,
    collapsed, toggleCollapsed, sleptTargets, stageMode, toggleStageMode,
  } = useFleetStore();
  const isCollapsed = useCallback((key: string) => collapsed.includes(key), [collapsed]);
  const [compactFleet, setCompactFleet] = useState(
    () => typeof window !== "undefined" && matchMedia("(max-width: 1023px)").matches,
  );
  const [compactRecentExpanded, setCompactRecentExpanded] = useState(false);
  const [compactStageExpanded, setCompactStageExpanded] = useState(false);

  // Grouped-first Fleet applies to phones, tablets and narrow landscape.
  // This is viewport state, not a first-visit preference: returning users
  // receive the same useful default without a per-visit storage gate.
  useEffect(() => {
    const query = matchMedia("(max-width: 1023px)");
    const update = () => setCompactFleet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const recentCollapsed = compactFleet ? !compactRecentExpanded : isCollapsed("_recent");
  const toggleRecent = useCallback(() => {
    if (compactFleet) setCompactRecentExpanded((expanded) => !expanded);
    else toggleCollapsed("_recent");
  }, [compactFleet, toggleCollapsed]);

  // Sync busy agents to store
  useEffect(() => {
    const busyAgentsData = agents.filter(a => a.status === "busy").map(a => ({ target: a.target, name: a.name, session: a.session }));
    if (busyAgentsData.length > 0) markBusy(busyAgentsData);
    pruneRecent();
  }, [agents, markBusy, pruneRecent]);

  // --- Preview state ---
  type PreviewInfo = { agent: AgentState; accent: string; label: string; pos: { x: number; y: number } };
  const [hoverPreview, setHoverPreview] = useState<PreviewInfo | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pinnedPreview, setPinnedPreview] = useState<PreviewInfo | null>(null);
  const [pinnedAnimPos, setPinnedAnimPos] = useState<{ left: number; top: number } | null>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const [inputBufs, setInputBufs] = useState<Record<string, string>>({});
  const getInputBuf = useCallback((target: string) => inputBufs[target] || "", [inputBufs]);
  const setInputBuf = useCallback((target: string, val: string) => {
    setInputBufs(prev => ({ ...prev, [target]: val }));
  }, []);

  // --- Hover/click callbacks ---
  const showPreview = useCallback((agent: AgentState, accent: string, label: string, e: React.MouseEvent) => {
    if (pinnedPreview) return;
    clearTimeout(hoverTimeout.current);
    const cardW = PREVIEW_CARD.width;
    let x = e.clientX + 8;
    if (x + cardW > window.innerWidth - 8) x = e.clientX - cardW - 8;
    if (x < 8) x = 8;
    setHoverPreview({ agent, accent, label, pos: { x, y: e.clientY - 120 } });
  }, [pinnedPreview]);

  const hidePreview = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoverPreview(null), 300);
  }, []);

  const keepPreview = useCallback(() => { clearTimeout(hoverTimeout.current); }, []);

  const onAgentClick = useCallback((agent: AgentState, accent: string, label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinnedPreview && pinnedPreview.agent.target === agent.target) { setPinnedPreview(null); return; }
    setPinnedPreview({ agent, accent, label, pos: { x: e.clientX, y: e.clientY } });
    setHoverPreview(null);
    send({ type: "subscribe", target: agent.target });
  }, [pinnedPreview, send]);

  // After sending via mic input, open pinned preview to watch the result
  const onSendDone = useCallback((agent: AgentState, accent: string, label: string) => {
    setPinnedPreview({ agent, accent, label, pos: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
    setHoverPreview(null);
    send({ type: "subscribe", target: agent.target });
  }, [send]);

  useEffect(() => {
    if (pinnedPreview) {
      setPinnedAnimPos({
        left: (window.innerWidth - PREVIEW_CARD.width) / 2,
        top: Math.max(40, (window.innerHeight - PREVIEW_CARD.maxHeight) / 2),
      });
    } else { setPinnedAnimPos(null); }
  }, [pinnedPreview]);

  const onPinnedFullscreen = useCallback(() => {
    if (pinnedPreview) { const a = pinnedPreview.agent; setPinnedPreview(null); setTimeout(() => onSelectAgent(a), 150); }
  }, [pinnedPreview, onSelectAgent]);
  const onPinnedClose = useCallback(() => setPinnedPreview(null), []);

  // --- Computed data ---
  const sessionAgents = useMemo(() => {
    const map = new Map<string, AgentState[]>();
    for (const a of agents) { const arr = map.get(a.session) || []; arr.push(a); map.set(a.session, arr); }
    return map;
  }, [agents]);

  const sorted = useMemo(() => sortRooms(sessions, sessionAgents, sortMode), [sessions, sessionAgents, sortMode]);
  const fleetGroups = useMemo(
    () => buildFleetGroups(fleetGroupMode, sorted, agents, teams),
    [fleetGroupMode, sorted, agents, teams],
  );

  const sleepGroup = useCallback((groupAgents: AgentState[]) => {
    for (const agent of groupAgents) send({ type: "sleep", target: agent.target });
  }, [send]);

  const stopGroup = useCallback((label: string, groupAgents: AgentState[]) => {
    if (!confirm(`Stop all agents in ${label}?`)) return;
    for (const agent of groupAgents) send({ type: "stop", target: agent.target });
  }, [send]);

  // Resolve per-agent feed log — primary oracle + worktree windows
  const getAgentFeedLog = useCallback((agentName: string): FeedLogEntry[] | null => {
    if (!agentFeedLog) return null;
    const oracleName = agentName.replace(/-oracle$/, "");
    const events = agentFeedLog.get(oracleName);
    if (!events || events.length === 0) return null;
    // For worktree windows (e.g. "homekeeper-statusline"), filter to matching project
    const suffix = agentName.replace(/^[^-]+-/, ""); // "statusline" from "homekeeper-statusline"
    const isWorktree = !agentName.endsWith("-oracle");
    const filtered = isWorktree
      ? events.filter(e => e.project.includes(suffix))
      : events;
    if (filtered.length === 0) return null;
    return filtered.map(e => ({ text: describeActivity(e), ts: e.ts, project: e.project, eventType: e.event }));
  }, [agentFeedLog]);

  const busyAgents = useMemo(() => agents.filter(a => a.status === "busy"), [agents]);

  // Recently active: busy agents first, then recently-gone from store
  // Deduplicated by agent name (same agent may have multiple tmux windows)
  const recentlyActive = useMemo((): (AgentState | RecentEntry)[] => {
    const agentMap = new Map(agents.map(a => [a.target, a]));
    const busyTargets = new Set(busyAgents.map(a => a.target));

    // Dedup busy agents by name — keep first (arbitrary, same agent)
    const seenNames = new Set<string>();
    const dedupBusy = busyAgents.filter(a => {
      if (seenNames.has(a.name)) return false;
      seenNames.add(a.name);
      return true;
    });

    // Recently-gone: in store but not currently busy, dedup by name (keep most recent)
    const recentByName = new Map<string, RecentEntry>();
    for (const e of Object.values(recentMap)) {
      if (busyTargets.has(e.target)) continue;
      const prev = recentByName.get(e.name);
      if (!prev || e.lastBusy > prev.lastBusy) recentByName.set(e.name, e);
    }
    const recentGone = [...recentByName.values()]
      .filter(e => !seenNames.has(e.name))
      .sort((a, b) => b.lastBusy - a.lastBusy)
      .slice(0, 5)
      .map(e => agentMap.get(e.target) || agents.find(a => a.name === e.name) || e);

    // Active first, then recently-gone
    return [...dedupBusy, ...recentGone];
  }, [agents, busyAgents, recentMap]);

  return (
    <div ref={containerRef} className="relative w-full min-h-screen flex flex-col" style={{ background: "#0a0a12" }}>
      {/* Toggle: Stage vs Pitch */}
      <div className="order-2 lg:order-1" data-fleet-stage>
        {compactFleet && (
          <button
            type="button"
            className="lg:hidden w-[calc(100%-1.5rem)] mx-3 mt-2 min-h-12 px-4 rounded-xl flex items-center gap-3 text-left font-mono text-xs text-white/45"
            style={{ background: "#12121c", border: "1px solid rgba(255,255,255,0.06)" }}
            aria-expanded={compactStageExpanded}
            data-fleet-stage-toggle
            onClick={() => setCompactStageExpanded((expanded) => !expanded)}
          >
            <span className="text-amber-400/70">Stage / activity</span>
            <span className="ml-auto">{compactStageExpanded ? "Hide" : "Show"}</span>
          </button>
        )}
        {(!compactFleet || compactStageExpanded) && (stageMode === "pitch" ? (
          <FootballPitch
            agents={agents}
            recentMap={recentMap}
            showPreview={showPreview}
            hidePreview={hidePreview}
            onAgentClick={onAgentClick}
            onToggleView={toggleStageMode}
          />
        ) : (
          <>
            <div className="max-w-5xl mx-auto px-6 lg:px-8 flex justify-end pt-4">
              <button
                onClick={toggleStageMode}
                className="min-h-12 px-3 py-1 rounded-lg text-[11px] font-mono cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Switch to Pitch
              </button>
            </div>
            <StageSection
              busyAgents={busyAgents}
              recentlyActive={recentlyActive}
              recentMap={recentMap}
              getAgentFeedLog={getAgentFeedLog}
              showPreview={showPreview}
              hidePreview={hidePreview}
              onAgentClick={onAgentClick}
            />
          </>
        ))}
      </div>

      {/* Grouped agent directory */}
      <div className="order-1 lg:order-2 w-full max-w-5xl mx-auto flex flex-col px-3 sm:px-6 lg:px-8 py-6 gap-4" data-fleet-directory>
        {/* Recently Active group — always visible */}
        <section className="order-3 lg:order-none rounded-2xl overflow-hidden" data-fleet-recent style={{ background: "#12121c", border: "1px solid rgba(251,191,36,0.15)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4 cursor-pointer select-none" style={{ background: "rgba(251,191,36,0.03)" }}
            onClick={toggleRecent} role="button" tabIndex={0}
            aria-expanded={!recentCollapsed}
            data-fleet-recent-toggle
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRecent(); } }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#fbbf24", boxShadow: "0 0 6px #fbbf24" }} />
            <h3 className="min-w-0 truncate text-sm sm:text-base font-bold tracking-[2px] sm:tracking-[4px] uppercase" style={{ color: "#fbbf24" }}>Recently Active</h3>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>{recentlyActive.length}</span>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" className="ml-auto flex-shrink-0 transition-transform duration-200"
              style={{ transform: recentCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
              <path d="M4 6l4 4 4-4" stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
            </svg>
          </div>
          {!recentCollapsed && <div className="h-[1px]" style={{ background: "rgba(251,191,36,0.12)" }} />}
          {!recentCollapsed && (
            <div className="flex flex-col">
              {recentlyActive.length === 0 && (
                <div className="px-6 py-4 text-[13px] font-mono text-white/20">No recent activity yet</div>
              )}
              {recentlyActive.map((entry, i) => {
                const rs = roomStyle(entry.session);
                const isBusyNow = "status" in entry && (entry as AgentState).status === "busy";
                const lastBusy = recentMap[entry.target]?.lastBusy || 0;
                const ago = Math.round((Date.now() - lastBusy) / 1000);
                const agoLabel = isBusyNow ? undefined : (ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`);
                // Build a full AgentState — use live data if available, otherwise fake from stored metadata
                const agent: AgentState = "status" in entry
                  ? entry as AgentState
                  : { target: entry.target, name: entry.name, session: entry.session, windowIndex: 0, active: false, preview: "", status: "idle" };
                return (
                  <AgentRow key={`recent-${entry.target}`} agent={agent} accent={rs.accent} roomLabel={rs.label}
                    isLast={i === recentlyActive.length - 1}
                    featured={i === 0} agoLabel={agoLabel} feedLog={getAgentFeedLog(agent.name)}
                    slept={sleptTargets.includes(entry.target)} alignWidth={96}
                    observe={observe} showPreview={showPreview} hidePreview={hidePreview} onAgentClick={onAgentClick}
                    send={send} onSendDone={onSendDone} teams={teams} fleetAgents={agents} />
                );
              })}
            </div>
          )}
        </section>

        <div className="order-1 lg:order-none flex flex-wrap items-center gap-2" aria-label="Fleet grouping controls">
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/30 mr-1">Group by</span>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["session", "team"] as const).map((mode) => (
              <button key={mode}
                className="min-h-12 px-3 py-1.5 text-[11px] font-mono capitalize"
                style={{
                  background: fleetGroupMode === mode ? "rgba(100,181,246,0.14)" : "transparent",
                  color: fleetGroupMode === mode ? "#64b5f6" : "rgba(255,255,255,0.35)",
                }}
                aria-pressed={fleetGroupMode === mode}
                onClick={() => setFleetGroupMode(mode)}>
                {mode}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-mono text-white/20 ml-auto">
            {fleetGroups.length} {fleetGroupMode === "session" ? "rooms" : "teams"} · {agents.length} agents
          </span>
        </div>

        {fleetGroups.length === 0 && (
          <div className="order-2 lg:order-none rounded-2xl px-5 py-10 text-center font-mono text-sm text-white/25"
            style={{ background: "#12121c", border: "1px solid rgba(255,255,255,0.06)" }}>
            No agents in the fleet
          </div>
        )}

        {/* Session/team cards */}
        {fleetGroups.map((group) => {
          const sessionStyle = roomStyle(group.label);
          const memberColor = group.team?.members.find((member) => member.color)?.color;
          const accent = group.kind === "standalone"
            ? "#94a3b8"
            : group.kind === "team" && memberColor
              ? COLOR_MAP[memberColor] || sessionStyle.accent
              : sessionStyle.accent;
          const hasBusy = group.counts.busy > 0;
          const friendlyRoom = group.kind === "session" ? roomStyle(group.label).label : undefined;
          const subtitle = group.subtitle || (friendlyRoom && friendlyRoom.toLowerCase() !== group.label.toLowerCase() ? friendlyRoom : undefined);
          const collapsedKey = `fleet:${group.key}`;
          return (
            <section key={group.key} className="order-2 lg:order-none rounded-2xl overflow-hidden"
              style={{ background: "#12121c", border: `1px solid ${hasBusy ? accent + "40" : accent + "18"}`, boxShadow: hasBusy ? `0 0 24px ${accent}12` : "0 2px 8px rgba(0,0,0,0.3)" }}
              aria-label={`${group.label} ${group.kind} group with ${group.agents.length} agents`}>
              <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 cursor-pointer select-none"
                style={{ background: `color-mix(in srgb, #12121c 94%, ${accent})` }}
                onClick={() => toggleCollapsed(collapsedKey)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapsed(collapsedKey); } }}>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: hasBusy ? "#ffa726" : group.agents.length ? "#22C55E" : "#475569", boxShadow: hasBusy ? "0 0 10px #ffa726" : undefined }} />
                <div className="min-w-0 flex-1 basis-36">
                  <h3 className="truncate text-sm sm:text-base font-bold tracking-[1px] sm:tracking-[2px] uppercase" style={{ color: accent }}>{group.label}</h3>
                  {subtitle && <div className="truncate text-[10px] font-mono text-white/30 mt-0.5">{subtitle}</div>}
                </div>
                <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-1 rounded-md" style={{ background: `${accent}20`, color: accent }}>{group.agents.length}</span>
                <div className="flex flex-wrap items-center gap-1 text-[9px] sm:text-[10px] font-mono">
                  {group.counts.busy > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400">{group.counts.busy} busy</span>}
                  {group.counts.ready > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">{group.counts.ready} ready</span>}
                  {group.counts.idle > 0 && <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-white/35">{group.counts.idle} idle</span>}
                  {group.counts.crashed > 0 && <span className="px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">{group.counts.crashed} crashed</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button title={`Sleep ${group.label}`} onClick={(e) => { e.stopPropagation(); sleepGroup(group.agents); }}
                    className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-all active:scale-90"
                    style={{ background: "rgba(251,191,36,0.12)" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="#fbbf24"><rect x={6} y={5} width={4} height={14} rx={1} /><rect x={14} y={5} width={4} height={14} rx={1} /></svg>
                  </button>
                  <button title={`Stop ${group.label}`} onClick={(e) => { e.stopPropagation(); stopGroup(group.label, group.agents); }}
                    className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-all active:scale-90"
                    style={{ background: "rgba(239,68,68,0.12)" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="#ef4444"><rect x={5} y={5} width={14} height={14} rx={2} /></svg>
                  </button>
                </div>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" className="ml-auto flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isCollapsed(collapsedKey) ? "rotate(-90deg)" : "rotate(0deg)" }}>
                  <path d="M4 6l4 4 4-4" stroke={accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
                </svg>
              </div>
              {!isCollapsed(collapsedKey) && <div className="h-[1px]" style={{ background: `${accent}25` }} />}
              {!isCollapsed(collapsedKey) && (
                <div className="flex flex-col">
                  {group.agents.length === 0 && (
                    <div className="px-4 sm:px-6 py-4 text-[12px] font-mono text-white/20">No agents in this group</div>
                  )}
                  {group.agents.map((agent, i) => (
                    <AgentRow key={agent.target} agent={agent} accent={accent} roomLabel={group.label}
                      isLast={i === group.agents.length - 1}
                      feedLog={getAgentFeedLog(agent.name)}
                      slept={sleptTargets.includes(agent.target)}
                      observe={observe} showPreview={showPreview} hidePreview={hidePreview} onAgentClick={onAgentClick}
                      send={send} onSendDone={onSendDone} teams={teams} fleetAgents={agents}
                      showSessionBadge={fleetGroupMode === "team"} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="order-3">
        <BottomStats agents={agents} eventLog={eventLog} />
      </div>

      {/* Hover Preview — compact mini card */}
      {hoverPreview && !pinnedPreview && (
        <div className="fixed pointer-events-auto" style={{ zIndex: 30, left: hoverPreview.pos.x, top: hoverPreview.pos.y, animation: "fadeSlideIn 0.15s ease-out" }}
          onMouseEnter={keepPreview} onMouseLeave={hidePreview}
          onClick={(e) => onAgentClick(hoverPreview.agent, hoverPreview.accent, hoverPreview.label, e)}>
          <MiniPreview agent={hoverPreview.agent} accent={hoverPreview.accent} roomLabel={hoverPreview.label} />
        </div>
      )}

      {/* Backdrop */}
      {pinnedPreview && (
        <div className="fixed inset-0" style={{ zIndex: 35, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} onClick={onPinnedClose} />
      )}

      {/* Pinned Preview */}
      {pinnedPreview && pinnedAnimPos && (
        <div ref={pinnedRef} className="fixed pointer-events-auto" style={{ zIndex: 40, left: pinnedAnimPos.left, top: pinnedAnimPos.top, maxWidth: PREVIEW_CARD.width }}>
          <HoverPreviewCard key={pinnedPreview.agent.target} agent={pinnedPreview.agent} roomLabel={pinnedPreview.label} accent={pinnedPreview.accent}
            pinned send={send} onFullscreen={onPinnedFullscreen} onClose={onPinnedClose}
            eventLog={eventLog} addEvent={addEvent}
            externalInputBuf={getInputBuf(pinnedPreview.agent.target)}
            onInputBufChange={(val) => setInputBuf(pinnedPreview.agent.target, val)} />
        </div>
      )}

    </div>
  );
});
