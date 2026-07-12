/**
 * askDetect fixture tests — run with `bun test`.
 *
 * The .txt fixtures under __fixtures__/ are REAL `tmux capture-pane -e` dumps
 * (ANSI included) of live Claude Code / codex panes, captured 2026-07-12. They
 * are the ground truth this parser must keep handling — regenerate them from a
 * real pane if a TUI's layout changes, don't hand-edit.
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { detectAskFromPane } from "./askDetect";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "__fixtures__", name), "utf-8");

describe("detectAskFromPane — real captures", () => {
  test("Claude permission dialog → permission, 3 opts, option 1 highlighted", () => {
    const d = detectAskFromPane(fixture("claude-permission.txt"));
    expect(d).not.toBeNull();
    expect(d!.type).toBe("permission");
    expect(d!.respondMode).toBe("keys");
    expect(d!.question).toBe("Do you want to proceed?");
    expect(d!.options).toHaveLength(3);
    expect(d!.options[0].selected).toBe(true);
    expect(d!.options.filter((o) => o.selected)).toHaveLength(1);
    expect(d!.options[0].label).toMatch(/^Yes/);
    expect(d!.options[2].label).toMatch(/^No/);
    // the command under review survives in the context block
    expect(d!.context).toMatch(/touch/);
  });

  test("Claude plan-mode approval → plan, 4 opts, no footer bleed into option 4", () => {
    const d = detectAskFromPane(fixture("claude-plan.txt"));
    expect(d).not.toBeNull();
    expect(d!.type).toBe("plan");
    expect(d!.question).toBe("Would you like to proceed?");
    expect(d!.options).toHaveLength(4);
    expect(d!.options[0].selected).toBe(true);
    // "shift+tab to approve with this feedback" is a hint line, not part of
    // option 4 — regression guard for the FOOTER_RE `shift` case.
    expect(d!.options[3].label).toBe("Tell Claude what to change");
  });

  test("codex exec approval (› marker, shortcut-key labels) → permission, keys", () => {
    const d = detectAskFromPane(fixture("codex-approval.txt"));
    expect(d).not.toBeNull();
    // "Would you like to run…" must NOT be misread as plan-mode ("…proceed?")
    expect(d!.type).toBe("permission");
    expect(d!.question).toBe("Would you like to run the following command?");
    expect(d!.respondMode).toBe("keys");
    expect(d!.options).toHaveLength(3);
    expect(d!.options[0].selected).toBe(true); // › highlights option 1
    expect(d!.options[0].label).toMatch(/^Yes, proceed/);
    expect(d!.options[2].label).toMatch(/^No/);
  });

  test("codex idle pane (ghost prompt, no dialog) → null", () => {
    expect(detectAskFromPane(fixture("codex-idle.txt"))).toBeNull();
  });

  test("busy pane mid-work (no dialog) → null", () => {
    expect(detectAskFromPane(fixture("claude-busy.txt"))).toBeNull();
  });
});

describe("detectAskFromPane — synthetic shapes", () => {
  test("bare y/n prompt → permission, text mode", () => {
    const d = detectAskFromPane("Deleting 3 files.\nProceed? (y/n) ");
    expect(d).not.toBeNull();
    expect(d!.type).toBe("permission");
    expect(d!.respondMode).toBe("text");
    expect(d!.options.map((o) => o.key)).toEqual(["y", "n"]);
  });

  test("codex numbered prompt (› marker, Press enter footer) → detected", () => {
    const cap = [
      "› 1. Update now (runs `npm install -g @openai/codex`)",
      "  2. Skip",
      "  3. Skip until next version",
      "",
      "  Press enter to continue",
    ].join("\n");
    const d = detectAskFromPane(cap);
    expect(d).not.toBeNull();
    expect(d!.options).toHaveLength(3);
    expect(d!.options[0].selected).toBe(true); // › is the highlight marker
    expect(d!.respondMode).toBe("keys");
  });

  test("numbered list in plain agent output (no ❯ highlight) → null", () => {
    // The exact false-positive this parser must never produce: an agent
    // enumerating steps is not a blocked dialog.
    const cap = [
      "Here is my plan:",
      "  1. Read the config",
      "  2. Patch the handler",
      "  3. Run the tests",
      "All done — proceeding now.",
    ].join("\n");
    expect(detectAskFromPane(cap)).toBeNull();
  });

  test("dialog while agent is streaming (esc to interrupt) → suppressed", () => {
    const cap = [
      "Do you want to proceed?",
      "❯ 1. Yes",
      "  2. No",
      "  esc to interrupt",
    ].join("\n");
    expect(detectAskFromPane(cap)).toBeNull();
  });

  test("ANSI-wrapped permission dialog still parses", () => {
    const E = "\x1b[38;5;153m";
    const R = "\x1b[39m";
    const cap = [
      ` Do you want to proceed?`,
      ` ${E}❯${R} 1. Yes`,
      `   2. No`,
      ` Esc to cancel · Tab to amend`,
    ].join("\n");
    const d = detectAskFromPane(cap);
    expect(d).not.toBeNull();
    expect(d!.options[0].selected).toBe(true);
  });

  test("empty / whitespace input → null", () => {
    expect(detectAskFromPane("")).toBeNull();
    expect(detectAskFromPane("\n\n   \n")).toBeNull();
  });
});
