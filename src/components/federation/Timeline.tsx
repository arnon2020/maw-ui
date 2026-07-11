import { useFederationStore } from "./store";

function fmtAgo(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `-${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `-${h}h${m % 60}m` : `-${h}h`;
}

/**
 * Replay scrubber over the message history. Dragging off the right edge
 * (or hitting LIVE) returns to realtime; anywhere else replays message
 * pulses around that moment on the canvas.
 */
export function Timeline() {
  const { messageLog, replayTs, setReplayTs } = useFederationStore();
  if (messageLog.length < 2) return null;

  const now = Date.now();
  const oldest = Math.min(...messageLog.map(m => m.ts));
  const span = Math.max(now - oldest, 60_000);
  const pos = replayTs === null ? 1000 : Math.round(((replayTs - oldest) / span) * 1000);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-lg border"
      style={{ background: "rgba(3,10,24,0.92)", borderColor: "rgba(255,255,255,0.08)", width: "min(46vw, 560px)" }}>
      <button onClick={() => setReplayTs(null)}
        className="text-[10px] font-mono cursor-pointer px-2 py-0.5 rounded flex-shrink-0"
        style={{
          color: replayTs === null ? "#4ade80" : "rgba(255,255,255,0.35)",
          background: replayTs === null ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
          border: "none",
        }}>
        LIVE
      </button>
      <div className="relative flex-1 h-5 flex items-center">
        <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
        {messageLog.map((m, i) => (
          <span key={i} className="absolute w-px h-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${((m.ts - oldest) / span) * 100}%`, background: "rgba(0,245,212,0.35)" }} />
        ))}
        <input
          type="range" min={0} max={1000} value={pos}
          onChange={e => {
            const v = Number(e.target.value);
            // snap back to live at the right edge
            if (v >= 995) setReplayTs(null);
            else setReplayTs(oldest + (v / 1000) * span);
          }}
          className="absolute inset-x-0 w-full cursor-pointer opacity-70"
          style={{ height: 20, background: "transparent", accentColor: "#00f5d4" }}
        />
      </div>
      <span className="text-[10px] font-mono w-12 text-right flex-shrink-0 tabular-nums"
        style={{ color: replayTs !== null ? "#00f5d4" : "rgba(255,255,255,0.25)" }}>
        {replayTs === null ? "live" : fmtAgo(now - replayTs)}
      </span>
    </div>
  );
}
