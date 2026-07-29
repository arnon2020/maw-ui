import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { roomStyle } from "../lib/constants";
import {
  TERMINAL_KEY_EVENT,
  TERMINAL_KEY_SEQUENCES,
} from "../lib/terminalInput";
import type { Session, AgentState } from "../lib/types";

const XTerminal = lazy(() => import("./XTerminal").then((module) => ({ default: module.XTerminal })));

interface TerminalViewProps {
  sessions: Session[];
  agents: AgentState[];
  connected: boolean;
  onSelectAgent: (agent: AgentState) => void;
  /** Agent name from the #terminal/<name> deep link — auto-selects its window */
  initialAgent?: string | null;
}

export const TerminalView = memo(function TerminalView({
  sessions,
  agents,
  connected,
  initialAgent,
}: TerminalViewProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [inputBuf, setInputBuf] = useState("");
  const [ptyConnected, setPtyConnected] = useState(false);
  const keyboardInputRef = useRef<HTMLInputElement>(null);
  const resolvedAgentRef = useRef<string | null>(null);

  // Resolve the deep link once per value without overriding later manual picks.
  useEffect(() => {
    if (!initialAgent || sessions.length === 0) return;
    if (resolvedAgentRef.current === initialAgent) return;
    const want = initialAgent.toLowerCase();
    let found: string | null = null;
    outer: for (const session of sessions) {
      const sessionBase = session.name.replace(/^\d+-/, "").toLowerCase();
      for (const window of session.windows) {
        const windowName = (window.name || "").toLowerCase();
        if (
          windowName === want
          || windowName === `${want}-oracle`
          || windowName.replace(/-oracle$/, "") === want
          || sessionBase === want
        ) {
          found = `${session.name}:${window.index}`;
          break outer;
        }
      }
    }
    if (found) {
      resolvedAgentRef.current = initialAgent;
      setSelectedTarget(found);
    }
  }, [initialAgent, sessions]);

  const selectWindow = useCallback((target: string) => {
    setSelectedTarget(target);
    setInputBuf("");
    setPtyConnected(false);
  }, []);

  const dispatchTerminalInput = useCallback((detail: {
    sequence?: string;
    action?: "history" | "live" | "focus";
  }) => {
    if (!selectedTarget) return;
    window.dispatchEvent(new CustomEvent(TERMINAL_KEY_EVENT, {
      detail: { target: selectedTarget, ...detail },
    }));
  }, [selectedTarget]);

  const sendSequence = useCallback((sequence: string) => {
    if (!sequence || !ptyConnected) return;
    dispatchTerminalInput({ sequence });
  }, [dispatchTerminalInput, ptyConnected]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!selectedTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) setInputBuf((buffer) => buffer + "\n");
      else if (inputBuf) {
        sendSequence(`${inputBuf}\r`);
        setInputBuf("");
      } else {
        sendSequence(TERMINAL_KEY_SEQUENCES.enter);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setInputBuf("");
      dispatchTerminalInput({ action: "live" });
    } else if (event.key === "Tab") {
      event.preventDefault();
      sendSequence(`${inputBuf}\t`);
      setInputBuf("");
    } else if (event.key.toLowerCase() === "c" && event.ctrlKey) {
      event.preventDefault();
      sendSequence(TERMINAL_KEY_SEQUENCES.ctrlC);
      setInputBuf("");
    }
  }, [dispatchTerminalInput, inputBuf, selectedTarget, sendSequence]);

  const selectedAgent = selectedTarget
    ? agents.find((agent) => agent.target === selectedTarget)
    : undefined;
  const selectedName = selectedAgent?.name
    || sessions.flatMap((session) => session.windows.map((window) => ({
      target: `${session.name}:${window.index}`,
      name: window.name,
    }))).find((window) => window.target === selectedTarget)?.name
    || "";
  const siblings = selectedAgent
    ? agents.filter((agent) => agent.session === selectedAgent.session)
    : [];

  return (
    <div className="flex flex-1 min-h-0 mx-2 sm:mx-6 mb-3 rounded-2xl overflow-hidden border border-white/[0.06]">
      <div
        className="w-[108px] sm:w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06] overflow-y-auto"
        style={{ background: "#08080e" }}
      >
        {sessions.map((session) => {
          const style = roomStyle(session.name);
          return (
            <div key={session.name} className="py-1">
              <div
                className="px-4 py-1 text-[10px] uppercase tracking-[1px]"
                style={{ color: `${style.accent}80` }}
              >
                {session.name}
              </div>
              {session.windows.map((window) => {
                const target = `${session.name}:${window.index}`;
                const active = target === selectedTarget;
                const agent = agents.find((candidate) => candidate.target === target);
                const statusColor = agent?.status === "busy"
                  ? "#ffa726"
                  : agent?.status === "ready"
                    ? "#4caf50"
                    : "#333";
                return (
                  <button
                    key={target}
                    type="button"
                    className="w-full min-h-12 flex items-center gap-2 cursor-pointer transition-colors text-left"
                    style={{
                      paddingLeft: 12,
                      paddingRight: 12,
                      background: active ? `${style.accent}12` : "transparent",
                      borderLeft: active ? `3px solid ${style.accent}` : "3px solid transparent",
                    }}
                    onClick={() => selectWindow(target)}
                  >
                    <span className="text-[11px] font-mono text-white/30 w-4 text-right flex-shrink-0">
                      {window.index}
                    </span>
                    <span
                      className="text-[12px] font-mono truncate"
                      style={{ color: active ? style.accent : "#999" }}
                    >
                      {window.name}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0"
                      style={{
                        background: statusColor,
                        boxShadow: window.active ? `0 0 4px ${statusColor}` : undefined,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 outline-none">
        <div
          className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06] flex-shrink-0"
          style={{ background: "#0a0a12" }}
        >
          <span className="text-xs font-mono text-white/40">{selectedName || "select a window"}</span>
          {selectedTarget && (
            <span className="text-[10px] font-mono text-white/20">{selectedTarget}</span>
          )}
          <span
            className="ml-auto text-[10px] font-mono"
            style={{ color: connected && ptyConnected ? "#4caf50" : "#ef5350" }}
          >
            {connected && ptyConnected ? "interactive" : "reconnecting"}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden" data-terminal-output>
          {selectedAgent ? (
            <Suspense fallback={(
              <div className="flex items-center justify-center h-full text-white/30 text-sm font-mono">
                Loading terminal...
              </div>
            )}>
              <XTerminal
                target={selectedAgent.target}
                onClose={() => {}}
                onNavigate={() => {}}
                siblings={siblings}
                onSelectSibling={(agent) => selectWindow(agent.target)}
                onConnectedChange={setPtyConnected}
                inputAccessory={(
                  <div
                    className="flex items-center px-3 py-1.5 border-t border-white/[0.06] font-mono text-[13px] min-h-12"
                    style={{ background: "#0d0d14" }}
                  >
                    <span className="text-white/30 mr-2 flex-shrink-0">&gt;</span>
                    <input
                      ref={keyboardInputRef}
                      value={inputBuf}
                      onChange={(event) => setInputBuf(event.target.value)}
                      onKeyDown={handleKeyDown}
                      inputMode="text"
                      enterKeyHint="send"
                      autoCapitalize="off"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Terminal keyboard input"
                      disabled={!selectedTarget || !ptyConnected}
                      className="text-white/90 flex-1 min-w-0 bg-transparent border-0 outline-none p-0 font-mono text-[16px] sm:text-[13px] disabled:opacity-30"
                      placeholder={selectedTarget ? "Type a command…" : "Select a window"}
                    />
                    {inputBuf && (
                      <button
                        type="button"
                        className="min-h-12 min-w-12 px-2 text-white/30 text-[11px] hover:text-red-400"
                        onClick={() => setInputBuf("")}
                      >
                        clear
                      </button>
                    )}
                  </div>
                )}
              />
            </Suspense>
          ) : (
            <div className="text-white/15 text-center mt-[30vh] text-sm">
              select a window ←
            </div>
          )}
        </div>

      </div>
    </div>
  );
});
