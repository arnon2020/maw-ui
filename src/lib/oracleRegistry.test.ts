import { describe, expect, test } from "bun:test";
import {
  canonicalOracleName,
  coalesceOracleRegistryRefresh,
  filterOracleNames,
  namesFromConfig,
  namesFromOracleResponse,
  refetchOracleRegistryOnOpen,
  type OracleRegistryOpenSource,
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

describe("oracle registry refresh triggers", () => {
  test("coalesces simultaneous lifecycle and WebSocket refresh triggers", async () => {
    const gate = { current: null as Promise<void> | null };
    let fetchCount = 0;
    let finishFetch!: () => void;
    const fetchRegistry = () => {
      fetchCount++;
      return new Promise<void>((resolve) => {
        finishFetch = resolve;
      });
    };

    const lifecycleRefresh = coalesceOracleRegistryRefresh(gate, fetchRegistry);
    const websocketRefresh = coalesceOracleRegistryRefresh(gate, fetchRegistry);

    expect(lifecycleRefresh).toBe(websocketRefresh);
    await Promise.resolve();
    expect(fetchCount).toBe(1);

    finishFetch();
    await lifecycleRefresh;
    expect(gate.current).toBeNull();

    const nextRefresh = coalesceOracleRegistryRefresh(gate, async () => {
      fetchCount++;
    });
    expect(nextRefresh).not.toBe(lifecycleRefresh);
    await nextRefresh;
    expect(fetchCount).toBe(2);
  });

  test("refetches on every WebSocket open/reconnect and detaches cleanly", async () => {
    const openListeners = new Set<() => void>();
    const socket: OracleRegistryOpenSource = {
      addEventListener: (type, listener) => {
        if (type === "open") openListeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === "open") openListeners.delete(listener);
      },
    };
    const results: string[][] = [];
    const errors: unknown[] = [];
    let fetchCount = 0;
    const fetchRegistry = async () => {
      fetchCount++;
      return {
        names: [`agent-${fetchCount}`],
        version: String(fetchCount),
        source: "oracles" as const,
      };
    };

    const detach = refetchOracleRegistryOnOpen(
      socket,
      (result) => results.push(result.names),
      (error) => errors.push(error),
      fetchRegistry,
    );

    for (const listener of openListeners) listener();
    await Promise.resolve();
    for (const listener of openListeners) listener();
    await Promise.resolve();

    expect(fetchCount).toBe(2);
    expect(results).toEqual([["agent-1"], ["agent-2"]]);
    expect(errors).toEqual([]);

    detach();
    expect(openListeners.size).toBe(0);
  });
});
