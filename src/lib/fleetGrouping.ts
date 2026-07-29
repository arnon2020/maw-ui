import type { Team, TeamMember } from "../components/TeamPanel";
import type { AgentState, PaneStatus, Session } from "./types";

export type FleetGroupMode = "session" | "team";

export interface AgentTeamMembership {
  team: Team;
  member: TeamMember;
  /** Team member name is the role identifier exposed by /api/teams. */
  role: string;
}

export interface FleetGroup {
  key: string;
  kind: FleetGroupMode | "standalone";
  label: string;
  subtitle?: string;
  agents: AgentState[];
  team?: Team;
  counts: Record<PaneStatus, number>;
}

const normalize = (value?: string) => (value || "").trim().toLowerCase();

export function statusCounts(agents: AgentState[]): Record<PaneStatus, number> {
  const counts: Record<PaneStatus, number> = { busy: 0, ready: 0, idle: 0, crashed: 0 };
  for (const agent of agents) counts[agent.status] += 1;
  return counts;
}

/**
 * Resolve against the real /api/teams payload.
 *
 * A member name can occur in stale teams, so prefer an exact team↔session match,
 * then an exact cwd match, then the newest team record. This also makes a team
 * whose members span sessions resolve consistently without inventing annotations.
 */
export function resolveAgentTeam(
  agent: AgentState,
  teams: Team[] = [],
  fleetAgents: AgentState[] = [],
): AgentTeamMembership | undefined {
  const agentName = normalize(agent.name);
  const sessionMemberNames = new Set(
    fleetAgents
      .filter((candidate) => candidate.session === agent.session)
      .map((candidate) => normalize(candidate.name)),
  );
  const candidates = teams.flatMap((team) =>
    team.members
      .filter((member) =>
        normalize(member.name) === agentName
        || Boolean(agent.cwd && member.cwd && member.cwd === agent.cwd)
      )
      .map((member) => ({ team, member }))
  );
  candidates.sort((a, b) => {
    const aSession = normalize(a.team.name) === normalize(agent.session) ? 1 : 0;
    const bSession = normalize(b.team.name) === normalize(agent.session) ? 1 : 0;
    if (aSession !== bSession) return bSession - aSession;
    const aCwd = agent.cwd && a.member.cwd === agent.cwd ? 1 : 0;
    const bCwd = agent.cwd && b.member.cwd === agent.cwd ? 1 : 0;
    if (aCwd !== bCwd) return Number(bCwd) - Number(aCwd);
    const aCoverage = a.team.members.filter((member) => sessionMemberNames.has(normalize(member.name))).length;
    const bCoverage = b.team.members.filter((member) => sessionMemberNames.has(normalize(member.name))).length;
    if (aCoverage !== bCoverage) return bCoverage - aCoverage;
    if (Boolean(a.team.alive) !== Boolean(b.team.alive)) return Number(Boolean(b.team.alive)) - Number(Boolean(a.team.alive));
    const aFresh = a.team.lastActivity || a.team.createdAt || 0;
    const bFresh = b.team.lastActivity || b.team.createdAt || 0;
    if (aFresh !== bFresh) return bFresh - aFresh;
    return a.team.name.localeCompare(b.team.name);
  });
  const match = candidates[0];
  return match ? { ...match, role: match.member.name } : undefined;
}

export function buildFleetGroups(
  mode: FleetGroupMode,
  sessions: Session[],
  agents: AgentState[],
  teams: Team[] = [],
): FleetGroup[] {
  if (mode === "session") {
    const bySession = new Map<string, AgentState[]>();
    for (const agent of agents) {
      const group = bySession.get(agent.session) || [];
      group.push(agent);
      bySession.set(agent.session, group);
    }
    const sessionNames = [
      ...sessions.map((session) => session.name),
      ...agents.map((agent) => agent.session).filter((name) => !sessions.some((session) => session.name === name)),
    ];
    return [...new Set(sessionNames)].map((name) => {
      const groupAgents = bySession.get(name) || [];
      return {
        key: `session:${name}`,
        kind: "session",
        label: name,
        agents: groupAgents,
        counts: statusCounts(groupAgents),
      };
    });
  }

  const grouped = new Map<string, { team: Team; agents: AgentState[] }>();
  const standalone: AgentState[] = [];
  for (const agent of agents) {
    const membership = resolveAgentTeam(agent, teams, agents);
    if (!membership) {
      standalone.push(agent);
      continue;
    }
    const group = grouped.get(membership.team.name) || { team: membership.team, agents: [] };
    group.agents.push(agent);
    grouped.set(membership.team.name, group);
  }
  const teamGroups = [...grouped.values()]
    .sort((a, b) => a.team.name.localeCompare(b.team.name))
    .map(({ team, agents: groupAgents }): FleetGroup => ({
      key: `team:${team.name}`,
      kind: "team",
      label: team.name,
      subtitle: `${new Set(groupAgents.map((agent) => agent.session)).size} session${new Set(groupAgents.map((agent) => agent.session)).size === 1 ? "" : "s"}`,
      agents: groupAgents,
      team,
      counts: statusCounts(groupAgents),
    }));
  if (standalone.length > 0 || teamGroups.length === 0) {
    teamGroups.push({
      key: "team:standalone",
      kind: "standalone",
      label: "Standalone",
      subtitle: "No team membership",
      agents: standalone,
      counts: statusCounts(standalone),
    });
  }
  return teamGroups;
}
