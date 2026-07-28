import { describe, expect, test } from "bun:test";
import {
  AgentStatusBadge,
  launchUiResult,
  shouldConfirmFromWindowKeydown,
  showingAgentCount,
} from "./SummonPanel";
import { renderToStaticMarkup } from "react-dom/server";
import { summonAction } from "../lib/summonAgent";

describe("SummonPanel confirm keyboard guard", () => {
  test("does not launch from the combobox Enter that advances to confirm", () => {
    expect(shouldConfirmFromWindowKeydown({
      step: "confirm",
      key: "Enter",
      shiftKey: false,
      targetTag: "INPUT",
    })).toBe(false);
  });

  test("does not hijack Enter from the Back or Launch buttons", () => {
    expect(shouldConfirmFromWindowKeydown({
      step: "confirm",
      key: "Enter",
      shiftKey: false,
      targetTag: "BUTTON",
    })).toBe(false);
  });

  test("still confirms on a deliberate Step 2 Enter from the task textarea", () => {
    expect(shouldConfirmFromWindowKeydown({
      step: "confirm",
      key: "Enter",
      shiftKey: false,
      targetTag: "TEXTAREA",
    })).toBe(true);
  });
});

describe("SummonPanel launch result state", () => {
  test("clears multiline task text after an accepted launch", () => {
    expect(launchUiResult("first line\nsecond line", {
      ok: true,
      message: "Task queued",
    })).toEqual({
      state: "success",
      message: "Task queued",
      task: "",
    });
  });

  test("retains task text after a rejected launch", () => {
    expect(launchUiResult("retry this", {
      ok: false,
      error: "Unavailable",
    })).toEqual({
      state: "error",
      message: "Unavailable",
      task: "retry this",
    });
  });

  test("shows a display-only LIVE notification returned by the launcher", () => {
    expect(launchUiResult("", {
      ok: false,
      message: "codex-fanout is already live at 117-codex-fanout, use Overview to jump",
    })).toEqual({
      state: "error",
      message: "codex-fanout is already live at 117-codex-fanout, use Overview to jump",
      task: "",
    });
  });
});

describe("SummonPanel agent count grammar", () => {
  test("uses singular only for exactly one agent", () => {
    expect(showingAgentCount(1)).toBe("Showing 1 agent");
    expect(showingAgentCount(0)).toBe("Showing 0 agents");
    expect(showingAgentCount(12)).toBe("Showing 12 agents");
  });
});

describe("SummonPanel registry status badges", () => {
  const liveAgents = new Map([["codex-fanout", "117-codex-fanout"]]);

  test("renders a LIVE badge with the active session id", () => {
    const markup = renderToStaticMarkup(
      <AgentStatusBadge name="codex-fanout" liveAgents={liveAgents} />,
    );
    expect(markup).toContain("LIVE · 117-codex-fanout");
    expect(markup).toContain("status: live at 117-codex-fanout");
  });

  test("renders a DORMANT badge when no live session exists", () => {
    const markup = renderToStaticMarkup(
      <AgentStatusBadge name="neo" liveAgents={liveAgents} />,
    );
    expect(markup).toContain("DORMANT");
    expect(markup).toContain("status: dormant");
  });
});

describe("SummonPanel launch branching", () => {
  test("LIVE with a task dispatches through POST /api/send", () => {
    expect(summonAction("codex-fanout", "inspect this", true, "117-codex-fanout")).toEqual({
      kind: "request",
      path: "/api/send",
      body: { target: "codex-fanout", text: "inspect this" },
    });
  });

  test("LIVE without a task makes no request and reports its session", () => {
    expect(summonAction("codex-fanout", "  ", true, "117-codex-fanout")).toEqual({
      kind: "notify",
      message: "codex-fanout is already live at 117-codex-fanout, use Overview to jump",
    });
  });

  test("DORMANT without a task wakes through POST /api/wake", () => {
    expect(summonAction("neo", "", false)).toEqual({
      kind: "request",
      path: "/api/wake",
      body: { target: "neo", oracle: "neo" },
    });
  });

  test("DORMANT with a task dispatches through POST /api/send", () => {
    expect(summonAction("neo", "  start work  ", false)).toEqual({
      kind: "request",
      path: "/api/send",
      body: { target: "neo", text: "start work" },
    });
  });
});
