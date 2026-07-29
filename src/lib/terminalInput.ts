export const TERMINAL_KEY_SEQUENCES = {
  esc: "\x1b",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  ctrlC: "\x03",
  enter: "\r",
} as const;

export const TERMINAL_KEY_EVENT = "maw:xterminal-key";

export type TerminalKey = keyof typeof TERMINAL_KEY_SEQUENCES;

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
