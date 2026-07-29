import { mount } from "../core/mount";
import { AppShell, type AppContext } from "../core/AppShell";
import { useFleetStore } from "../lib/store";
import { usePaneRawStore } from "../lib/previewStore";
import { detectAskFromPane } from "../lib/askDetect";
import { agentColor } from "../lib/constants";
import { useState, useRef, useEffect, useCallback } from "react";
import type { AskItem, AskOption } from "../lib/types";

// tmux key names the server maps to bare keystrokes (no Enter appended) —
// dialogs are driven the way a human drives them: arrows + Enter / Esc.
const KEY = { down: "\x1b[B", up: "\x1b[A", enter: "\r", esc: "\x1b" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const TYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  input: { bg: "rgba(34,211,238,0.12)", text: "#22d3ee", label: "Question" },
  attention: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24", label: "Attention" },
  plan: { bg: "rgba(168,85,247,0.12)", text: "#a855f7", label: "Plan approval" },
  permission: { bg: "rgba(251,146,60,0.12)", text: "#fb923c", label: "Permission" },
};

/** Color an option button by what it does, not where it sits */
function optionStyle(label: string): { background: string; color: string } {
  if (/^no\b|reject|cancel|keep planning|refine|tell claude|exit/i.test(label)) return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  // Amber = "yes, but broadens future access" — always-allow, auto-accept edits,
  // plan auto mode. Distinct from the plain green "yes, this once".
  if (/always|don't ask|auto-accept|auto mode|manually approve/i.test(label)) return { background: "rgba(251,191,36,0.12)", color: "#fbbf24" };
  return { background: "rgba(34,197,94,0.15)", color: "#22c55e" };
}

function TerminalLink({ oracle }: { oracle: string }) {
  const base = oracle.replace(/-oracle$/, "");
  return (
    <a
      href={`/#terminal/${encodeURIComponent(base)}`}
      target="_blank"
      rel="noreferrer"
      className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:opacity-80"
      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
      title="Open terminal to see full context"
    >⌨ terminal</a>
  );
}

function AskCard({ ask, send }: { ask: AskItem; send: (msg: object) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [staleWarn, setStaleWarn] = useState(false);
  const dismissAsk = useFleetStore((s) => s.dismissAsk);
  const answerAsk = useFleetStore((s) => s.answerAsk);
  const accent = agentColor(ask.oracle);
  const style = TYPE_STYLE[ask.type] || TYPE_STYLE.input;
  const options = ask.options || [];
  const hasDialog = ask.source === "pane" && options.length > 0;

  // TOCTOU guard: the prompt on screen may have changed between render and
  // click — never fire keystrokes at a dialog we can't confirm is current.
  const promptStillCurrent = useCallback((): boolean => {
    if (ask.source !== "pane" || !ask.promptKey) return true;
    const raw = usePaneRawStore.getState().raw[ask.target];
    if (!raw) return true; // no fresher capture — allow
    const cur = detectAskFromPane(raw);
    return !!cur && cur.promptKey === ask.promptKey;
  }, [ask]);

  const finish = useCallback((label: string) => {
    answerAsk(ask.id, label);
    setBusy(false);
    // Notification asks have no pane-watch to confirm resolution — retire them
    if (ask.source !== "pane") setTimeout(() => dismissAsk(ask.id), 800);
  }, [answerAsk, dismissAsk, ask.id, ask.source]);

  const chooseOption = useCallback(async (opt: AskOption) => {
    if (!ask.target || busy) return;
    if (!promptStillCurrent()) { setStaleWarn(true); return; }
    setBusy(true);
    if (ask.respondMode === "text") {
      // y/n prompt: server's send path types the key and appends Enter itself
      send({ type: "send", target: ask.target, text: opt.key || String(opt.index) });
    } else {
      // Navigate the highlight to the chosen row, then confirm. Arrow/Enter
      // are mapped server-side to bare keystrokes — nothing extra is typed.
      const from = options.find((o) => o.selected) || options[0];
      const steps = opt.index - from.index;
      const key = steps > 0 ? KEY.down : KEY.up;
      for (let i = 0; i < Math.abs(steps); i++) {
        send({ type: "send", target: ask.target, text: key });
        await sleep(120);
      }
      send({ type: "send", target: ask.target, text: KEY.enter });
    }
    finish(opt.label);
  }, [ask, busy, options, promptStillCurrent, send, finish]);

  const sendEsc = useCallback(() => {
    if (!ask.target || busy) return;
    setBusy(true);
    send({ type: "send", target: ask.target, text: KEY.esc });
    finish("Esc");
  }, [ask.target, busy, send, finish]);

  const sendReply = useCallback((reply: string) => {
    if (!ask.target || busy || !reply) return;
    setBusy(true);
    // One send only — the server appends Enter (with confirm-retry) itself.
    send({ type: "send", target: ask.target, text: reply });
    finish(reply);
  }, [ask.target, busy, send, finish]);

  // Answered, waiting for the pane to confirm the prompt is gone
  if (ask.answeredWith && !ask.answerStale) {
    return (
      <div className="rounded-xl p-4 border" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: accent }}>{ask.oracle}</span>
          <span className="text-sm text-emerald-400 font-mono truncate">Sent: {ask.answeredWith}</span>
          {ask.source === "pane" && <span className="text-[10px] text-white/25 font-mono ml-auto">confirming…</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: `${accent}25` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${accent}20`, color: accent }}>
          {ask.oracle.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold" style={{ color: accent }}>{ask.oracle}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.text }}>{style.label}</span>
        <TerminalLink oracle={ask.oracle} />
        <span className="text-[10px] font-mono text-white/25 ml-auto">{timeAgo(ask.ts)}</span>
      </div>

      {ask.answerStale && (
        <div className="text-[11px] font-mono px-2 py-1.5 rounded-lg mb-2" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          ⚠ Reply sent ({ask.answeredWith}) but the prompt is still on screen — check the terminal.
        </div>
      )}
      {staleWarn && (
        <div className="text-[11px] font-mono px-2 py-1.5 rounded-lg mb-2" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
          ⚠ The prompt changed since this card was rendered — nothing was sent. Re-check before answering.
        </div>
      )}

      {ask.context && (
        <pre className="text-[11px] font-mono text-white/50 mb-2 px-2 py-1.5 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-28 overflow-y-auto" style={{ background: "rgba(255,255,255,0.03)" }}>{ask.context}</pre>
      )}
      <p className="text-sm text-white/80 mb-3 leading-relaxed whitespace-pre-wrap">{ask.message}</p>

      {hasDialog && (
        <div className="flex flex-col gap-1.5 mb-2">
          {options.map((opt) => (
            <button
              key={opt.index}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-left active:scale-[0.98] disabled:opacity-40"
              style={optionStyle(opt.label)}
              onClick={() => chooseOption(opt)}
            >
              {opt.selected ? "❯ " : ""}{opt.index}. {opt.label.length > 90 ? opt.label.slice(0, 87) + "…" : opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {ask.source === "pane" && (
          <button
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono disabled:opacity-40"
            style={{ background: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.8)" }}
            onClick={sendEsc}
            title="Send Escape (cancel the dialog)"
          >Esc</button>
        )}
        {(!hasDialog || ask.respondMode === "text") && ask.target && (
          <input type="text" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { sendReply(text.trim()); setText(""); } }}
            placeholder="Reply..."
            disabled={busy}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs text-white outline-none placeholder:text-white/20 disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", WebkitAppearance: "none" as const }}
            enterKeyHint="send" autoComplete="off"
          />
        )}
        <button className="px-2 py-1.5 rounded-lg text-[10px] font-mono ml-auto" style={{ color: "rgba(255,255,255,0.3)" }} onClick={() => dismissAsk(ask.id)}>Dismiss</button>
      </div>
    </div>
  );
}

const RESOLUTION_LABEL: Record<string, { text: string; color: string }> = {
  answered: { text: "answered", color: "#22c55e" },
  resolved: { text: "resolved", color: "#22d3ee" },
  dismissed: { text: "dismissed", color: "rgba(255,255,255,0.35)" },
};

function InboxContent({ ctx }: { ctx: AppContext }) {
  const { send, agents, connected } = ctx;
  const asks = useFleetStore((s) => s.asks);
  const undismissAsk = useFleetStore((s) => s.undismissAsk);

  // Live detection needs pane captures for every agent — subscribe them all.
  // (Fleet is small; the server only pushes captures that actually changed.)
  const targetsKey = agents.map((a) => a.target).sort().join("\n");
  useEffect(() => {
    if (!connected || !targetsKey) return;
    send({ type: "subscribe-previews", targets: targetsKey.split("\n") });
  }, [connected, targetsKey, send]);

  const pending = asks.filter((a) => !a.dismissed);
  const recent = asks.filter((a) => a.dismissed).slice(0, 10);

  return (
    <div className="flex-1 min-h-0 w-full max-w-2xl mx-auto px-4 py-8 overflow-y-auto">
      <h1 className="text-lg font-bold tracking-wider text-cyan-400 uppercase mb-6">
        Inbox {pending.length > 0 && <span className="text-red-400">({pending.length})</span>}
      </h1>

      {pending.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/30 text-sm">No pending asks</p>
          <p className="text-white/15 text-[11px] mt-1">
            Agents blocked on a permission dialog, plan approval, or question will appear here
          </p>
          {connected && agents.length > 0 && (
            <p className="text-white/15 text-[10px] font-mono mt-3">watching {agents.length} panes</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {pending.map((ask) => <AskCard key={ask.id} ask={ask} send={send} />)}
      </div>

      {recent.length > 0 && (
        <>
          <div className="text-[10px] font-mono text-white/15 uppercase tracking-wider mt-8 mb-2">Recent</div>
          <div className="flex flex-col gap-1">
            {recent.map((ask) => {
              const res = RESOLUTION_LABEL[ask.resolution || "dismissed"] || RESOLUTION_LABEL.dismissed;
              return (
                <div key={ask.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg opacity-60" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <span className="text-xs font-semibold" style={{ color: agentColor(ask.oracle) }}>{ask.oracle}</span>
                  <span className="text-[10px] text-white/40 truncate flex-1">{ask.message}</span>
                  {ask.answeredWith && (
                    <span className="text-[9px] font-mono truncate max-w-32" style={{ color: "#22c55e" }}>→ {ask.answeredWith}</span>
                  )}
                  <span className="text-[9px] font-mono" style={{ color: res.color }}>{res.text}</span>
                  <span className="text-[9px] font-mono text-white/20">{timeAgo(ask.ts)}</span>
                  <button
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                    onClick={() => undismissAsk(ask.id)}
                    title="Restore to pending"
                  >undo</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

mount(() => (
  <AppShell view="inbox" fullHeight>
    {(ctx) => <InboxContent ctx={ctx} />}
  </AppShell>
));
