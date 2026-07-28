import { describe, expect, test } from "bun:test";
import {
  canonicalOracleName,
  filterOracleNames,
  namesFromConfig,
  namesFromOracleResponse,
} from "./oracleRegistry";

describe("oracle registry normalization", () => {
  test("canonicalizes oracle suffixes and rejects internal names", () => {
    expect(canonicalOracleName("neo-oracle")).toBe("neo");
    expect(canonicalOracleName("default")).toBeNull();
    expect(canonicalOracleName("_alive")).toBeNull();
  });

  test("reads typed registry arrays", () => {
    expect(namesFromOracleResponse({
      version: "7",
      oracles: ["neo-oracle", { name: "atlas" }, { canonicalName: "neo" }, "NEO-oracle"],
    })).toEqual(["atlas", "neo"]);
  });

  test("reads typed registry maps", () => {
    expect(namesFromOracleResponse({
      agents: {
        "sage-oracle": { state: "dormant" },
        alias: { canonicalName: "atlas-oracle" },
      },
    })).toEqual(["atlas", "sage"]);
  });

  test("uses every compatible config inventory source without duplicates", () => {
    expect(namesFromConfig({
      agents: { neo: "local", "neo-oracle": "local", atlas: "local" },
      sessions: { hound: "110-hound" },
      commands: { "sage-oracle": "codex", default: "claude", "_internal-oracle": "noop" },
    })).toEqual(["atlas", "hound", "neo", "sage"]);
  });

  test("filters names case-insensitively across separators", () => {
    const names = ["cipher-codex", "neo", "ui-designer"];
    expect(filterOracleNames(names, "UI des")).toEqual(["ui-designer"]);
    expect(filterOracleNames(names, "codex")).toEqual(["cipher-codex"]);
  });
});
