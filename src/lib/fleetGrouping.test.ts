import { describe, expect, test } from "bun:test";
import { buildFleetGroups, resolveAgentTeam } from "./fleetGrouping";
import type { AgentState, Session } from "./types";
import type { Team } from "../components/TeamPanel";

const agent = (name: string, session: string, status: AgentState["status"] = "idle"): AgentState => ({
  target: `${session}:${name}`,
  name,
  session,
  windowIndex: 0,
  active: false,
  preview: "",
  status,
});
const member = (name: string) => ({
  name, color: "blue", backendType: "tmux", isActive: true, tmuxPaneId: "", model: "inherit",
});
const team = (name: string, members: string[], lastActivity = 0): Team => ({
  name, description: "", members: members.map(member), lastActivity,
});

describe("fleet grouping", () => {
  test("groups one session containing multiple teams and a standalone agent", () => {
    const agents = [agent("coder", "113-room", "busy"), agent("verifier", "113-room", "ready"), agent("shell", "113-room")];
    const groups = buildFleetGroups("session", [{ name: "113-room", windows: [] }], agents, [
      team("builders", ["coder"]),
      team("quality", ["verifier"]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].agents).toHaveLength(3);
    expect(groups[0].counts).toEqual({ busy: 1, ready: 1, idle: 1, crashed: 0 });
  });

  test("groups a team whose agents span sessions", () => {
    const agents = [agent("coder", "113-room"), agent("verifier", "114-room")];
    const groups = buildFleetGroups("team", [] as Session[], agents, [team("fullstack", ["coder", "verifier"])]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("fullstack");
    expect(groups[0].subtitle).toBe("2 sessions");
  });

  test("puts agents without /api/teams membership in Standalone", () => {
    const groups = buildFleetGroups("team", [], [agent("oracle", "main")], []);
    expect(groups[0].kind).toBe("standalone");
    expect(groups[0].agents[0].name).toBe("oracle");
  });

  test("handles an empty fleet", () => {
    expect(buildFleetGroups("session", [], [], [])).toEqual([]);
    const teamGroups = buildFleetGroups("team", [], [], []);
    expect(teamGroups).toHaveLength(1);
    expect(teamGroups[0].agents).toEqual([]);
  });

  test("prefers an exact session team over a newer duplicate member record", () => {
    const exact = team("evidence-cell", ["verifier"], 10);
    const newer = team("other-stale-copy", ["verifier"], 20);
    expect(resolveAgentTeam(agent("verifier", "evidence-cell"), [newer, exact])?.team.name).toBe("evidence-cell");
  });

  test("otherwise selects the newest real team record for duplicate member names", () => {
    const old = team("old", ["verifier"], 10);
    const current = team("current", ["verifier"], 20);
    expect(resolveAgentTeam(agent("verifier", "113-room"), [old, current])?.team.name).toBe("current");
  });

  test("uses session membership density to disambiguate duplicate roles", () => {
    const fullstack = team("fullstack", ["coder", "verifier"], 10);
    const research = team("research", ["researcher", "verifier"], 20);
    const fleet = [agent("coder", "113-room"), agent("verifier", "113-room"), agent("researcher", "114-room")];
    expect(resolveAgentTeam(fleet[1], [research, fullstack], fleet)?.team.name).toBe("fullstack");
  });
});
