import { describe, expect, test } from "bun:test";
import {
  launchUiResult,
  shouldConfirmFromWindowKeydown,
  showingAgentCount,
} from "./SummonPanel";

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
});

describe("SummonPanel agent count grammar", () => {
  test("uses singular only for exactly one agent", () => {
    expect(showingAgentCount(1)).toBe("Showing 1 agent");
    expect(showingAgentCount(0)).toBe("Showing 0 agents");
    expect(showingAgentCount(12)).toBe("Showing 12 agents");
  });
});
