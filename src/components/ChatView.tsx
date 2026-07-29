import { memo, useMemo, useState } from "react";
import { agentColor } from "../lib/constants";
import { apiUrl } from "../lib/api";
import type { AgentState } from "../lib/types";
import { displayName, type MawLogEntry } from "./chat/types";
import { ChatGroup, DateSeparator } from "./chat/ChatBubble";
import { ThreadCard } from "./chat/ThreadCard";
import { useChatLog, useOracleNames, useFilteredEntries, useTimelineGroups, useLiveGroups, useThreads } from "./chat/useChatLog";

type Mode = "live" | "timeline" | "threads";

/** Name the human participant posts under — matches isHuman() in chat/types.ts */
const HUMAN_NAME = "nat";

interface ChatViewProps {
  agents: AgentState[];
  send: (msg: object) => void;
  connected: boolean;
}

function ComposeBar({ agents, send, connected, appendLocal }: ChatViewProps & { appendLocal: (e: MawLogEntry) => void }) {
  const [text, setText] = useState("");
  const [recipient, setRecipient] = useState("");

  // One entry per window name — agents are tmux windows and names repeat
  // across sessions on rare occasions; first wins.
  const targets = useMemo(() => {
    const seen = new Map<string, AgentState>();
    for (const a of agents) {
      const key = a.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, a);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  const effRecipient = recipient && targets.some((a) => a.name === recipient)
    ? recipient
    : targets[0]?.name ?? "";
  const agent = targets.find((a) => a.name === effRecipient);
  const canSend = connected && !!agent && !!text.trim();

  const handleSend = () => {
    if (!canSend || !agent) return;
    const body = text.trim();
    const now = new Date();
    // Into the agent's tmux pane (same pattern as FleetGrid broadcast /
    // inbox reply): text, then Enter a beat later so the TUI submits it.
    send({ type: "send", target: agent.target, text: body });
    setTimeout(() => send({ type: "send", target: agent.target, text: "\r" }), 60);
    // Into the feed so the message persists in chat history and reaches
    // other viewers. Timestamp is ours, so the WS echo dedupes against
    // the optimistic entry below.
    fetch(apiUrl("/api/feed"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: now.toISOString(),
        oracle: HUMAN_NAME,
        host: "maw-ui",
        event: "MessageSend",
        message: `${agent.name.toLowerCase()}: ${body}`,
        ts: now.getTime(),
      }),
    }).catch(() => {});
    appendLocal({ ts: now.toISOString(), from: HUMAN_NAME, to: agent.name.toLowerCase(), msg: body });
    setText("");
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 border-t flex-shrink-0"
      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
    >
      <select
        value={effRecipient}
        onChange={(e) => setRecipient(e.target.value)}
        disabled={targets.length === 0}
        className="text-[11px] font-mono rounded-lg px-2 py-2 outline-none cursor-pointer flex-shrink-0"
        style={{
          background: "rgba(255,255,255,0.05)",
          color: effRecipient ? agentColor(effRecipient) : "rgba(255,255,255,0.25)",
          border: "1px solid rgba(255,255,255,0.08)",
          maxWidth: "140px",
        }}
      >
        {targets.length === 0 ? (
          <option value="">no agents</option>
        ) : (
          targets.map((a) => (
            <option key={a.target} value={a.name}>@{displayName(a.name)}</option>
          ))
        )}
      </select>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
        placeholder={
          !connected ? "connecting..."
          : targets.length === 0 ? "no agents online — start one with `maw` first"
          : `Message @${displayName(effRecipient)}... (Enter = send)`
        }
        disabled={!connected || targets.length === 0}
        enterKeyHint="send"
        autoComplete="off"
        className="flex-1 min-w-0 px-4 py-2 rounded-xl text-sm text-white/90 outline-none placeholder:text-white/20"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="px-4 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-colors"
        style={{
          background: canSend ? "rgba(232,184,109,0.15)" : "rgba(255,255,255,0.03)",
          color: canSend ? "#e8b86d" : "rgba(255,255,255,0.15)",
          border: canSend ? "1px solid rgba(232,184,109,0.3)" : "1px solid rgba(255,255,255,0.06)",
          cursor: canSend ? "pointer" : "default",
        }}
      >
        Send
      </button>
    </div>
  );
}

function EmptyState({ hasAgents }: { hasAgents: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <span className="text-4xl">💬</span>
      <p className="text-white/60 text-sm font-semibold">ยังไม่มีบทสนทนา</p>
      <p className="text-white/35 text-xs leading-relaxed max-w-md">
        หน้านี้แสดงข้อความที่ AI agents ส่งหากันผ่าน{" "}
        <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "rgba(255,255,255,0.06)", color: "#64b5f6" }}>
          maw hey &lt;ชื่อ&gt; "&lt;ข้อความ&gt;"
        </code>
        {" "}และข้อความที่คุณส่งจากช่องด้านล่าง
      </p>
      <p className="text-white/35 text-xs leading-relaxed max-w-md">
        {hasAgents
          ? <>เริ่มบทสนทนา: เลือก agent ที่ช่องด้านล่างแล้วพิมพ์ข้อความ หรือลองสั่งให้ agent ทักเพื่อนดู เช่น "ช่วย hey ไปถาม tars ว่างานถึงไหนแล้ว"</>
          : <>ยังไม่มี agent ออนไลน์ — เปิด agent ด้วยคำสั่ง <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "rgba(255,255,255,0.06)", color: "#64b5f6" }}>maw</code> บนเครื่องก่อน แล้วข้อความจะขึ้นที่นี่</>}
      </p>
      <p className="text-white/20 text-[10px] font-mono mt-1">
        ประวัติเก็บในหน่วยความจำของ maw-serve — จะเริ่มนับใหม่เมื่อ service restart
      </p>
    </div>
  );
}

export const ChatView = memo(function ChatView({ agents, send, connected }: ChatViewProps) {
  const [filter, setFilter] = useState<string>("all");
  const [viewAsSel, setViewAsSel] = useState<string>("");
  const [mode, setMode] = useState<Mode>("timeline");
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const { entries, loading, sourceError, scrollRef, appendLocal } = useChatLog(mode);
  const oracleNames = useOracleNames(entries);
  // Default to the first oracle actually present on this fleet — the old
  // hardcoded "neo-oracle" doesn't exist everywhere.
  const viewAs = viewAsSel && oracleNames.includes(viewAsSel) ? viewAsSel : oracleNames[0] ?? "";
  const filtered = useFilteredEntries(entries, filter);
  const grouped = useTimelineGroups(filtered);
  const liveGrouped = useLiveGroups(filtered);
  const threads = useThreads(filtered);

  const toggleHighlight = (id: string) => setHighlighted(highlighted === id ? null : id);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ background: "#0a0a0f" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0 flex-wrap"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
      >
        <h2 className="text-sm font-bold tracking-wider" style={{ color: "#64b5f6" }}>
          191 AI คุยกันเอง | Build with Oracle
        </h2>
        <span className="text-[10px] font-mono text-white/20">{filtered.length} msgs</span>
        {mode === "live" && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "agent-pulse 1.5s ease-in-out infinite" }} />
            <span className="text-[10px] font-mono text-emerald-400/60">LIVE</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["live", "timeline", "threads"] as const).map((m) => (
              <button
                key={m}
                className="px-2.5 py-1 text-[11px] font-mono capitalize transition-colors"
                style={{
                  background: mode === m ? "rgba(100,181,246,0.12)" : "transparent",
                  color: mode === m ? "#64b5f6" : "rgba(255,255,255,0.25)",
                }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>

          {oracleNames.length > 0 && (
            <select
              value={viewAs}
              onChange={(e) => setViewAsSel(e.target.value)}
              className="text-[11px] font-mono rounded-lg px-2 py-1 outline-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)", color: agentColor(viewAs), border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {oracleNames.map((n) => (
                <option key={n} value={n}>{displayName(n)}</option>
              ))}
            </select>
          )}

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-[11px] font-mono rounded-lg px-2 py-1 outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <option value="all">All</option>
            {oracleNames.map((n) => (
              <option key={n} value={n}>{displayName(n)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {sourceError ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex flex-col items-center justify-center h-full gap-2 px-4"
          >
            <p className="text-red-400/80 text-sm font-mono">chat source unavailable</p>
            <p className="text-white/40 text-xs font-mono max-w-md text-center">{sourceError}</p>
            <p className="text-white/25 text-[10px] font-mono">source: <code className="text-white/40">/api/feed</code> — see server logs or retry</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-white/20 text-sm font-mono">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAgents={agents.length > 0} />
        ) : mode === "live" ? (
          <div className="max-w-2xl mx-auto flex flex-col gap-3">
            {liveGrouped.map(({ entries: g }, i) => (
              <ChatGroup key={`lv-${i}`} entries={g} isRight={false} highlighted={highlighted} onToggleHighlight={toggleHighlight} idPrefix={`lv-${i}`} />
            ))}
          </div>
        ) : mode === "threads" ? (
          <div className="max-w-2xl mx-auto flex flex-col gap-3">
            {threads.map(([pair, msgs], i) => (
              <ThreadCard key={pair} pair={pair} entries={msgs} viewAs={viewAs} defaultExpanded={i === 0} highlighted={highlighted} onToggleHighlight={toggleHighlight} />
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {grouped.map(({ date, entries: g }, i) => (
              <div key={`tl-${i}`}>
                {date && <DateSeparator date={date} />}
                <ChatGroup entries={g} isRight={g[0].from === viewAs} highlighted={highlighted} onToggleHighlight={toggleHighlight} idPrefix={`tl-${i}`} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose */}
      <ComposeBar agents={agents} send={send} connected={connected} appendLocal={appendLocal} />
    </div>
  );
});
