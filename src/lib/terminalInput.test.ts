import { describe, expect, test } from "bun:test";
import { TERMINAL_KEY_SEQUENCES, tmuxMouseWheelSequence } from "./terminalInput";

describe("terminal input sequences", () => {
  test("maps every virtual key to its PTY sequence", () => {
    expect(TERMINAL_KEY_SEQUENCES).toEqual({
      esc: "\x1b",
      tab: "\t",
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      ctrlC: "\x03",
      enter: "\r",
    });
  });

  test("encodes tmux SGR wheel at the terminal center", () => {
    expect(tmuxMouseWheelSequence("up", 2, 100, 40)).toBe("\x1b[<64;50;20M\x1b[<64;50;20M");
    expect(tmuxMouseWheelSequence("down", 1, 1, 1)).toBe("\x1b[<65;1;1M");
  });
});
