import type { WsErrorNotice as WsErrorNoticeState } from "../hooks/useSessions";

interface WsErrorNoticeProps {
  notice: WsErrorNoticeState | null;
  onDismiss: () => void;
}

export function WsErrorNotice({ notice, onDismiss }: WsErrorNoticeProps) {
  if (!notice) return null;

  const context = [notice.action, notice.target].filter(Boolean).join(" ");

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed left-3 right-3 top-[72px] z-[9997] mx-auto max-w-xl"
    >
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-xl"
        style={{ background: "rgba(24,7,10,0.94)", border: "1px solid rgba(248,113,113,0.45)" }}
      >
        <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: "#f87171" }} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase" style={{ color: "#fca5a5" }}>
            WebSocket error{context ? `: ${context}` : ""}
          </div>
          <div className="mt-1 break-words font-mono text-sm leading-5" style={{ color: "rgba(255,255,255,0.86)" }}>
            {notice.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg font-mono text-lg leading-none transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.62)" }}
          aria-label="Dismiss WebSocket error"
          title="Dismiss"
        >
          x
        </button>
      </div>
    </div>
  );
}
