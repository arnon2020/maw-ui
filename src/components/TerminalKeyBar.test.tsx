import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalKeyBar } from "./TerminalKeyBar";
import type { TerminalKey } from "../lib/terminalInput";

const noop = () => {};

function renderKeyBar(onKey: (key: TerminalKey, sequence: string) => void = noop) {
  return (
    <TerminalKeyBar
      historyActive={false}
      onKey={onKey}
      onHistoryToggle={noop}
      onKeyboard={noop}
      onScrollUp={noop}
      onScrollDown={noop}
    />
  );
}

describe("TerminalKeyBar virtual keys", () => {
  test("renders Ctrl+End without sticky modifiers or Home/End buttons", () => {
    const markup = renderToStaticMarkup(renderKeyBar());
    const labels = Array.from(markup.matchAll(/<button[^>]*>(.*?)<\/button>/g), ([, label]) => label);

    expect(labels).toEqual([
      "Esc",
      "Tab",
      "⇧Tab",
      "←",
      "↑",
      "↓",
      "→",
      "Ctrl+End",
      "PgUp",
      "PgDn",
      "Ctrl+C",
      "Ctrl+D",
      "Ctrl+Z",
      "Ctrl+L",
      "Ctrl+R",
      "/",
      "|",
      "Enter",
      "Scroll↑",
      "Scroll↓",
      "History",
      "Keyboard",
    ]);
    expect(markup).not.toContain("data-terminal-modifier");
    expect(markup).toContain('data-terminal-key="ctrlEnd"');
    expect(markup).not.toContain('data-terminal-key="home"');
    expect(markup).not.toContain('data-terminal-key="end"');
  });

  test("Ctrl+End emits the existing ctrl-end byte sequence", () => {
    const emitted: { key: TerminalKey; sequence: string }[] = [];
    const tree = TerminalKeyBar({
      historyActive: false,
      onKey: (key, sequence) => emitted.push({ key, sequence }),
      onHistoryToggle: noop,
      onKeyboard: noop,
      onScrollUp: noop,
      onScrollDown: noop,
    });
    const children = (tree.props.children as unknown[]).flat() as {
      props: { "data-terminal-key"?: string; onClick?: () => void };
    }[];
    const ctrlEnd = children.find((child) => child.props["data-terminal-key"] === "ctrlEnd");

    ctrlEnd?.props.onClick?.();

    expect(emitted).toEqual([{ key: "ctrlEnd", sequence: "\x1b[1;5F" }]);
  });
});
