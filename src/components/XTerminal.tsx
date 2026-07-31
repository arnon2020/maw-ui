import { useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../lib/api";
import { TERMINAL_KEY_EVENT, TERMINAL_KEY_SEQUENCES, tmuxMouseWheelSequence, type TerminalKey } from "../lib/terminalInput";
import { useStaticMode } from "../lib/staticMode";
import type { AgentState } from "../lib/types";
import { TerminalKeyBar } from "./TerminalKeyBar";

interface XTerminalProps {
  target: string;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  siblings: AgentState[];
  onSelectSibling: (agent: AgentState) => void;
  readOnly?: boolean;
  inputAccessory?: ReactNode;
  onHistoryActiveChange?: (active: boolean) => void;
  onConnectedChange?: (connected: boolean) => void;
}

// Catppuccin Mocha palette (matches AC array in ansi.ts)
const THEME = {
  background: "#0a0a0f",
  foreground: "#cdd6f4",
  cursor: "#22d3ee",
  cursorAccent: "#0a0a0f",
  selectionBackground: "#585b7066",
  black: "#0a0a0f",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  cyan: "#94e2d5",
  white: "#cdd6f4",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#ffffff",
};

function getVisibleBufferText(term: Terminal) {
  const buffer = term.buffer.active;
  const start = buffer.viewportY;
  const end = Math.min(buffer.length, start + term.rows);
  const lines: string[] = [];
  for (let y = start; y < end; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      lines.push("");
      continue;
    }
    const text = line.translateToString(true);
    if ((line as { isWrapped?: boolean }).isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text;
    } else {
      lines.push(text);
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function getVisibleDomText(container: HTMLDivElement | null) {
  if (!container) return "";
  const rows = Array.from(container.querySelectorAll(".xterm-rows > div"));
  return rows.map((row) => row.textContent || "").join("\n").trimEnd();
}

function makeReadableTerminalText(text: string) {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  return lines
    .map((line) => {
      if (line.trim() === "") return "";
      const withoutHugeIndent = line.replace(/^[ \t]{8,}/, "");
      return withoutHugeIndent.replace(/[ \t]{6,}/g, "  ");
    })
    .join("\n");
}

function copyTextToClipboard(text: string) {
  if (!text) return Promise.resolve(false);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopyText(text));
  }
  return Promise.resolve(fallbackCopyText(text));
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  textarea.remove();
  return ok;
}

function attachedSizeFromMessage(msg: { cols?: unknown; rows?: unknown }) {
  const cols = typeof msg.cols === "number" ? Math.floor(msg.cols) : Number.NaN;
  const rows = typeof msg.rows === "number" ? Math.floor(msg.rows) : Number.NaN;
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return null;
  return { cols, rows };
}

const WIDE_TERMINAL_MIN_COLS = 100;
const TERMINAL_FONT_SIZE = 12;
const TERMINAL_LINE_HEIGHT = 1.2;
const PTY_WS_BASE_DELAY = 1000;
const PTY_WS_MAX_DELAY = 15000;

function requestedTerminalSize(term: Terminal) {
  return {
    cols: Math.max(term.cols, WIDE_TERMINAL_MIN_COLS),
    rows: Math.max(term.rows, 1),
  };
}

export function XTerminal({
  target,
  onClose,
  onNavigate,
  siblings,
  onSelectSibling,
  readOnly = false,
  inputAccessory,
  onHistoryActiveChange,
  onConnectedChange,
}: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [historyActive, setHistoryActive] = useState(false);
  const staticMode = useStaticMode();

  // Keep callbacks in refs so terminal effect doesn't re-run on every render
  const onCloseRef = useRef(onClose);
  const onNavigateRef = useRef(onNavigate);
  const siblingsRef = useRef(siblings);
  const onSelectSiblingRef = useRef(onSelectSibling);
  const onHistoryActiveChangeRef = useRef(onHistoryActiveChange);
  const onConnectedChangeRef = useRef(onConnectedChange);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { siblingsRef.current = siblings; }, [siblings]);
  useEffect(() => { onSelectSiblingRef.current = onSelectSibling; }, [onSelectSibling]);
  useEffect(() => { onHistoryActiveChangeRef.current = onHistoryActiveChange; }, [onHistoryActiveChange]);
  useEffect(() => { onConnectedChangeRef.current = onConnectedChange; }, [onConnectedChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateHistoryActive = (active: boolean) => {
      setHistoryActive(active);
      onHistoryActiveChangeRef.current?.(active);
    };
    updateHistoryActive(false);
    onConnectedChangeRef.current?.(false);

    const term = new Terminal({
      theme: THEME,
      fontFamily: "'Noto Sans Mono Thai', 'Cascadia Mono', Consolas, 'SFMono-Regular', 'Noto Sans Thai', monospace",
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      letterSpacing: 0,
      cursorBlink: !readOnly && !staticMode,
      cursorStyle: readOnly ? "underline" : "bar",
      disableStdin: readOnly,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    let ws: WebSocket | null = null;
    let dataSub: { dispose: () => void } | null = null;
    let binSub: { dispose: () => void } | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let resizeObserver: ResizeObserver | null = null;
    let copyKeyHandler: ((e: KeyboardEvent) => void) | null = null;
    let terminalKeyHandler: ((event: Event) => void) | null = null;
    let touchStartHandler: ((event: TouchEvent) => void) | null = null;
    let touchEndHandler: ((event: TouchEvent) => void) | null = null;
    let attachedSize: { cols: number; rows: number } | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let alive = true;
    let cleanupReconnectListeners: (() => void) | null = null;
    const applyAttachedSize = (size: { cols: number; rows: number }) => {
      attachedSize = size;
      if (term.cols !== size.cols || term.rows !== size.rows) {
        term.resize(size.cols, size.rows);
      }
    };

    // Defer open until container has dimensions (avoids "dimensions" crash on first render)
    const openTimer = setTimeout(() => {
      try {
        term.open(container);
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => webgl.dispose());
          term.loadAddon(webgl);
        } catch { /* fallback to canvas renderer if WebGL unavailable */ }
        fit.fit();
        const requestedSize = requestedTerminalSize(term);
        if (term.cols !== requestedSize.cols || term.rows !== requestedSize.rows) {
          term.resize(requestedSize.cols, requestedSize.rows);
        }
        term.focus();
      } catch { return; }

      copyKeyHandler = (e: KeyboardEvent) => {
        const isCopyKey = e.key.toLowerCase() === "c" && (e.metaKey || e.ctrlKey);
        if (!isCopyKey || (!term.hasSelection() && !e.shiftKey)) return;
        const text = term.hasSelection()
          ? term.getSelection()
          : makeReadableTerminalText(getVisibleBufferText(term) || getVisibleDomText(containerRef.current));
        if (!text) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        copyTextToClipboard(text);
      };
      container.addEventListener("keydown", copyKeyHandler, true);

      const encoder = new TextEncoder();

      const attachCurrentTarget = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const requestedSize = requestedTerminalSize(term);
        ws.send(JSON.stringify({
          type: "attach",
          target,
          cols: requestedSize.cols,
          rows: requestedSize.rows,
        }));
      };

      const scheduleReconnect = (delay?: number) => {
        if (!alive) return;
        if (reconnectTimer) return;
        const retryDelay = delay ?? Math.min(PTY_WS_BASE_DELAY * 2 ** reconnectAttempt, PTY_WS_MAX_DELAY);
        reconnectAttempt++;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectPty();
        }, retryDelay);
      };

      const connectPty = () => {
        if (!alive) return;
        try { ws?.close(); } catch {}
        ws = new WebSocket(wsUrl("/ws/pty"));
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          reconnectAttempt = 0;
          attachCurrentTarget();
        };

        ws.onmessage = (e) => {
          if (typeof e.data === "string") {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === "attached") {
                onConnectedChangeRef.current?.(true);
                const size = attachedSizeFromMessage(msg);
                try {
                  if (size) applyAttachedSize(size);
                  else if (!attachedSize) fit.fit();
                } catch {}
              }
              if (msg.type === "detached") {
                onConnectedChangeRef.current?.(false);
                term.write("\r\n\x1b[33m[session detached - reconnecting]\x1b[0m\r\n");
                scheduleReconnect(1000);
                try { ws?.close(); } catch {}
              }
            } catch {}
          } else {
            // Binary PTY data → render in xterm.js
            term.write(new Uint8Array(e.data));
          }
        };

        ws.onclose = () => {
          onConnectedChangeRef.current?.(false);
          if (!alive) return;
          term.write("\r\n\x1b[33m[connection closed - reconnecting]\x1b[0m\r\n");
          scheduleReconnect();
        };

        ws.onerror = () => ws?.close();
      };

      const sendSequence = (sequence: string) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(encoder.encode(sequence));
      };
      const scrollTmuxHistory = (direction: "up" | "down", steps: number) => {
        sendSequence(tmuxMouseWheelSequence(direction, steps, term.cols, term.rows));
        if (direction === "up") updateHistoryActive(true);
      };

      terminalKeyHandler = (event: Event) => {
        if (readOnly) return;
        const detail = (event as CustomEvent<{
          target?: string;
          sequence?: string;
          action?: "history" | "live" | "focus" | "scrollUp" | "scrollDown";
        }>).detail;
        if (!detail || detail.target !== target) return;
        if (detail.action === "scrollUp") {
          scrollTmuxHistory("up", 40);
        } else if (detail.action === "scrollDown") {
          scrollTmuxHistory("down", 40);
        } else if (detail.action === "history") {
          scrollTmuxHistory("up", 120);
        } else if (detail.action === "live") {
          sendSequence(TERMINAL_KEY_SEQUENCES.esc);
          term.scrollToBottom();
          updateHistoryActive(false);
          term.focus();
        } else if (detail.action === "focus") {
          term.focus();
        } else if (typeof detail.sequence === "string") {
          sendSequence(detail.sequence);
          if (detail.sequence === TERMINAL_KEY_SEQUENCES.esc) updateHistoryActive(false);
          term.focus();
        }
      };
      window.addEventListener(TERMINAL_KEY_EVENT, terminalKeyHandler);

      let touchStartY: number | null = null;
      touchStartHandler = (event: TouchEvent) => {
        touchStartY = event.touches[0]?.clientY ?? null;
      };
      touchEndHandler = (event: TouchEvent) => {
        const endY = event.changedTouches[0]?.clientY;
        if (touchStartY !== null && endY !== undefined) {
          const distance = endY - touchStartY;
          if (distance > 28) scrollTmuxHistory("up", 120);
          else if (distance < -28) scrollTmuxHistory("down", 40);
        }
        touchStartY = null;
      };
      container.addEventListener("touchstart", touchStartHandler, { capture: true, passive: true });
      container.addEventListener("touchend", touchEndHandler, { capture: true, passive: true });

      const reconnectNow = () => {
        if (!alive || ws?.readyState === WebSocket.OPEN) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        scheduleReconnect(100);
      };
      window.addEventListener("online", reconnectNow);
      document.addEventListener("visibilitychange", reconnectNow);

      connectPty();

      if (!readOnly) {
        // Keystrokes → binary to PTY stdin
        dataSub = term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(encoder.encode(data));
          }
        });

        binSub = term.onBinary((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
            ws.send(bytes);
          }
        });
      }

      // Navigation shortcuts (work in both read-only and interactive)
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const isCopyKey = e.key.toLowerCase() === "c" && (e.metaKey || e.ctrlKey);
        if (isCopyKey && (term.hasSelection() || e.shiftKey)) {
          const text = term.hasSelection()
            ? term.getSelection()
            : makeReadableTerminalText(getVisibleBufferText(term) || getVisibleDomText(containerRef.current));
          if (text) {
            copyTextToClipboard(text);
            return false;
          }
          if (e.shiftKey) return false;
        }
        if (readOnly) return false; // Block all keys in read-only
        if (e.altKey && e.key === "ArrowLeft") { onNavigateRef.current(-1); return false; }
        if (e.altKey && e.key === "ArrowRight") { onNavigateRef.current(1); return false; }
        if (e.altKey && e.key >= "1" && e.key <= "9") {
          const idx = parseInt(e.key) - 1;
          if (idx < siblingsRef.current.length) onSelectSiblingRef.current(siblingsRef.current[idx]);
          return false;
        }
        return true;
      });

      // Auto-resize with debounce
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            fit.fit();
            const requestedSize = requestedTerminalSize(term);
            if (term.cols !== requestedSize.cols || term.rows !== requestedSize.rows) {
              term.resize(requestedSize.cols, requestedSize.rows);
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            }
          } catch {}
        }, 200);
      });
      resizeObserver.observe(container);

      cleanupReconnectListeners = () => {
        window.removeEventListener("online", reconnectNow);
        document.removeEventListener("visibilitychange", reconnectNow);
      };
    }, 50);

    return () => {
      alive = false;
      onConnectedChangeRef.current?.(false);
      if (copyKeyHandler) container.removeEventListener("keydown", copyKeyHandler, true);
      if (terminalKeyHandler) window.removeEventListener(TERMINAL_KEY_EVENT, terminalKeyHandler);
      if (touchStartHandler) container.removeEventListener("touchstart", touchStartHandler, true);
      if (touchEndHandler) container.removeEventListener("touchend", touchEndHandler, true);
      clearTimeout(openTimer);
      clearTimeout(resizeTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanupReconnectListeners?.();
      resizeObserver?.disconnect();
      dataSub?.dispose();
      binSub?.dispose();
      ws?.close();
      term.dispose();
    };
  }, [target, readOnly, staticMode]);

  const dispatchTerminalInput = (detail: { sequence?: string; action?: "history" | "live" | "focus" | "scrollUp" | "scrollDown" }) => {
    window.dispatchEvent(new CustomEvent(TERMINAL_KEY_EVENT, { detail: { target, ...detail } }));
  };

  const handleVirtualKey = (_key: TerminalKey, sequence: string) => {
    dispatchTerminalInput({ sequence });
  };

  return (
    <div className="terminal-shell relative w-full h-full min-h-0 flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-hidden"
        data-terminal-touch-surface
      />
      {!readOnly && inputAccessory}
      {!readOnly && (
        <TerminalKeyBar
          historyActive={historyActive}
          onKey={handleVirtualKey}
          onHistoryToggle={() => dispatchTerminalInput({ action: historyActive ? "live" : "history" })}
          onKeyboard={() => dispatchTerminalInput({ action: "focus" })}
          onScrollUp={() => dispatchTerminalInput({ action: "scrollUp" })}
          onScrollDown={() => dispatchTerminalInput({ action: "scrollDown" })}
        />
      )}
    </div>
  );
}
