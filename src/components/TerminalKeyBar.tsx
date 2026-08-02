import { useState } from "react";
import {
  terminalKeySequence,
  type TerminalKey,
  type TerminalModifiers,
} from "../lib/terminalInput";

interface TerminalKeyBarProps {
  disabled?: boolean;
  historyActive: boolean;
  onKey: (key: TerminalKey, sequence: string) => void;
  onHistoryToggle: () => void;
  onKeyboard: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

const KEYS: { key: TerminalKey; label: string; ariaLabel: string; group: string }[] = [
  { key: "esc", label: "Esc", ariaLabel: "Escape", group: "control" },
  { key: "tab", label: "Tab", ariaLabel: "Tab", group: "control" },
  { key: "shiftTab", label: "⇧Tab", ariaLabel: "Shift Tab", group: "control" },
  { key: "left", label: "←", ariaLabel: "Arrow left", group: "navigation" },
  { key: "up", label: "↑", ariaLabel: "Arrow up", group: "navigation" },
  { key: "down", label: "↓", ariaLabel: "Arrow down", group: "navigation" },
  { key: "right", label: "→", ariaLabel: "Arrow right", group: "navigation" },
  { key: "home", label: "Home", ariaLabel: "Home", group: "navigation" },
  { key: "end", label: "End", ariaLabel: "End", group: "navigation" },
  { key: "pageUp", label: "PgUp", ariaLabel: "Page up", group: "navigation" },
  { key: "pageDown", label: "PgDn", ariaLabel: "Page down", group: "navigation" },
  { key: "ctrlC", label: "Ctrl+C", ariaLabel: "Control C", group: "control" },
  { key: "ctrlD", label: "Ctrl+D", ariaLabel: "Control D", group: "control" },
  { key: "ctrlZ", label: "Ctrl+Z", ariaLabel: "Control Z", group: "control" },
  { key: "ctrlL", label: "Ctrl+L", ariaLabel: "Control L", group: "control" },
  { key: "ctrlR", label: "Ctrl+R", ariaLabel: "Control R", group: "control" },
  { key: "slash", label: "/", ariaLabel: "Slash", group: "text" },
  { key: "pipe", label: "|", ariaLabel: "Pipe", group: "text" },
  { key: "enter", label: "Enter", ariaLabel: "Enter", group: "control" },
];

const keyClass = "min-h-12 min-w-12 px-2 rounded-lg border border-white/10 bg-white/[0.05] text-[12px] font-mono text-white/65 hover:bg-white/10 hover:text-white active:bg-cyan-400/15 active:text-cyan-200 disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation shrink-0";

export function TerminalKeyBar({
  disabled = false,
  historyActive,
  onKey,
  onHistoryToggle,
  onKeyboard,
  onScrollUp,
  onScrollDown,
}: TerminalKeyBarProps) {
  const [modifiers, setModifiers] = useState<TerminalModifiers>({ ctrl: false, alt: false });
  const toggleModifier = (modifier: keyof TerminalModifiers) => {
    setModifiers((current) => ({ ...current, [modifier]: !current[modifier] }));
  };
  const sendKey = (key: TerminalKey) => {
    onKey(key, terminalKeySequence(key, modifiers));
  };

  return (
    <div
      className="terminal-key-bar flex gap-2 overflow-x-auto px-2 py-2 border-t border-white/[0.06] bg-[#0d0d14] overscroll-x-contain shrink-0"
      aria-label="Terminal virtual keys"
      data-terminal-key-bar
    >
      {(["ctrl", "alt"] as const).map((modifier) => (
        <button
          key={modifier}
          type="button"
          className={`${keyClass} ${modifiers[modifier] ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100" : ""}`}
          aria-label={`${modifier === "ctrl" ? "Control" : "Alt"} sticky modifier`}
          aria-pressed={modifiers[modifier]}
          data-terminal-modifier={modifier}
          disabled={disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => toggleModifier(modifier)}
        >
          {modifier === "ctrl" ? "Ctrl" : "Alt"}
        </button>
      ))}
      {KEYS.map(({ key, label, ariaLabel, group }) => (
        <button
          key={key}
          type="button"
          className={keyClass}
          aria-label={ariaLabel}
          data-terminal-key={key}
          data-terminal-key-group={group}
          disabled={disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => sendKey(key)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className={keyClass}
        aria-label="Scroll up"
        data-terminal-scroll="up"
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onScrollUp}
      >
        Scroll↑
      </button>
      <button
        type="button"
        className={keyClass}
        aria-label="Scroll down"
        data-terminal-scroll="down"
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onScrollDown}
      >
        Scroll↓
      </button>
      <button
        type="button"
        className={`${keyClass} ${historyActive ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : ""}`}
        aria-label={historyActive ? "Return to live terminal" : "Open terminal history"}
        aria-pressed={historyActive}
        data-terminal-history-toggle
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onHistoryToggle}
      >
        {historyActive ? "Live" : "History"}
      </button>
      <button
        type="button"
        className={keyClass}
        aria-label="Open mobile keyboard"
        data-terminal-keyboard
        disabled={disabled}
        onClick={onKeyboard}
      >
        Keyboard
      </button>
    </div>
  );
}
