const BASE_TERMINAL_KEY_SEQUENCES = {
  esc: "\x1b",
  tab: "\t",
  shiftTab: "\x1b[Z",
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  home: "\x1b[1~",
  end: "\x1b[4~",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
  ctrlC: "\x03",
  ctrlD: "\x04",
  ctrlZ: "\x1a",
  ctrlL: "\x0c",
  ctrlR: "\x12",
  slash: "/",
  pipe: "|",
  enter: "\r",
} as const;

export const TERMINAL_KEY_SEQUENCES = Object.defineProperty(
  BASE_TERMINAL_KEY_SEQUENCES,
  "ctrlEnd",
  {
    value: "\x1b[1;5F",
    enumerable: false,
  },
) as typeof BASE_TERMINAL_KEY_SEQUENCES;

const ALL_TERMINAL_KEY_SEQUENCES = TERMINAL_KEY_SEQUENCES as typeof BASE_TERMINAL_KEY_SEQUENCES & {
  readonly ctrlEnd: "\x1b[1;5F";
};

export const TERMINAL_KEY_EVENT = "maw:xterminal-key";

export type TerminalKey = keyof typeof BASE_TERMINAL_KEY_SEQUENCES | "ctrlEnd";

export interface TerminalModifiers {
  ctrl: boolean;
  alt: boolean;
}

const CTRL_KEY_SEQUENCES: Partial<Record<TerminalKey, string>> = {
  up: "\x1b[1;5A",
  down: "\x1b[1;5B",
  right: "\x1b[1;5C",
  left: "\x1b[1;5D",
  home: "\x1b[1;5H",
  end: "\x1b[1;5F",
  pageUp: "\x1b[5;5~",
  pageDown: "\x1b[6;5~",
  slash: "\x1f",
  pipe: "\x1c",
};

export function terminalKeySequence(
  key: TerminalKey,
  modifiers: TerminalModifiers = { ctrl: false, alt: false },
) {
  const base = modifiers.ctrl
    ? CTRL_KEY_SEQUENCES[key] ?? ALL_TERMINAL_KEY_SEQUENCES[key]
    : ALL_TERMINAL_KEY_SEQUENCES[key];
  return modifiers.alt ? `\x1b${base}` : base;
}

export function tmuxMouseWheelSequence(
  direction: "up" | "down",
  steps: number,
  cols: number,
  rows: number,
) {
  const button = direction === "up" ? 64 : 65;
  const column = Math.max(1, Math.ceil(cols / 2));
  const row = Math.max(1, Math.ceil(rows / 2));
  const count = Math.max(1, Math.floor(steps));
  return `\x1b[<${button};${column};${row}M`.repeat(count);
}
