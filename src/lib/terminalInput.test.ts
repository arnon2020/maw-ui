import { describe, expect, test } from "bun:test";
import {
  TERMINAL_KEY_SEQUENCES,
  terminalKeySequence,
  tmuxMouseWheelSequence,
} from "./terminalInput";

describe("terminal input sequences", () => {
  test("maps every virtual key to its PTY sequence", () => {
    expect(TERMINAL_KEY_SEQUENCES).toEqual({
      esc: "\x1b",
      tab: "\t",
      shiftTab: "\x1b[Z",
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      home: "\x1b[1~",
      end: "\x1b[4~",
      ctrlEnd: "\x1b[1;5F",
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
    });
  });

  test("applies sticky terminal modifiers to virtual keys", () => {
    expect(terminalKeySequence("up", { ctrl: true, alt: false })).toBe("\x1b[1;5A");
    expect(terminalKeySequence("pageDown", { ctrl: true, alt: false })).toBe("\x1b[6;5~");
    expect(terminalKeySequence("slash", { ctrl: true, alt: false })).toBe("\x1f");
    expect(terminalKeySequence("pipe", { ctrl: true, alt: false })).toBe("\x1c");
    expect(terminalKeySequence("shiftTab", { ctrl: false, alt: false })).toBe("\x1b[Z");
    expect(terminalKeySequence("left", { ctrl: false, alt: true })).toBe("\x1b\x1b[D");
    expect(terminalKeySequence("home", { ctrl: true, alt: true })).toBe("\x1b\x1b[1;5H");
    expect(terminalKeySequence("ctrlD", { ctrl: true, alt: false })).toBe("\x04");
  });

  test("encodes tmux SGR wheel at the terminal center", () => {
    expect(tmuxMouseWheelSequence("up", 2, 100, 40)).toBe("\x1b[<64;50;20M\x1b[<64;50;20M");
    expect(tmuxMouseWheelSequence("down", 1, 1, 1)).toBe("\x1b[<65;1;1M");
  });
});
