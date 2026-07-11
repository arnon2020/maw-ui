import type { AgentNode, AgentEdge } from "./types";

export type LayoutMode = "force" | "circle" | "grid" | "tree";

/**
 * Family key for an agent id: strip -oracle/-view, then climb dash-prefixes
 * to the SHORTEST existing agent id ("atlas-codex-oracle" → "atlas" when the
 * "atlas" agent exists; "ui-designer" stays its own family when "ui" doesn't).
 */
export function familyOf(id: string, ids: Set<string>): string {
  const base = id.replace(/-oracle$/, "").replace(/-view$/, "");
  let fam = base;
  let cur = base;
  while (cur.includes("-")) {
    cur = cur.slice(0, cur.lastIndexOf("-"));
    if (ids.has(cur)) fam = cur;
  }
  return fam;
}

/** Group agents by family (insertion order preserved). */
export function familyGroups(agents: AgentNode[]): Map<string, AgentNode[]> {
  const ids = new Set(agents.map(a => a.id));
  const groups = new Map<string, AgentNode[]>();
  for (const a of agents) {
    const f = familyOf(a.id, ids);
    const g = groups.get(f);
    if (g) g.push(a);
    else groups.set(f, [a]);
  }
  return groups;
}

/**
 * Deterministic "orbit" layout — the readability default.
 * Families are ranked (active first, then size), the top family sits at the
 * machine center and the rest fill concentric rings; members sit evenly on a
 * small circle around their family anchor. Same input → same picture, so the
 * eye can memorize where a family lives.
 */
export function layoutOrbit(
  agents: AgentNode[],
  W: number,
  H: number,
  isActive: (id: string) => boolean = () => false,
) {
  const machines = [...new Set(agents.map(a => a.node))];
  const cx = W * 0.48, cy = H * 0.5;
  const machineRingR = machines.length > 1 ? Math.min(W, H) * 0.3 : 0;

  const famR = (n: number) => (n <= 1 ? 0 : Math.max(26, (n * 44) / (2 * Math.PI)));

  function placeFamily(members: AgentNode[], fx: number, fy: number, baseAngle: number) {
    const n = members.length;
    if (n === 1) {
      members[0].x = fx; members[0].y = fy;
      members[0].vx = 0; members[0].vy = 0;
      return;
    }
    const r = famR(n);
    members.forEach((a, i) => {
      const ang = baseAngle + (i / n) * Math.PI * 2;
      a.x = fx + Math.cos(ang) * r;
      a.y = fy + Math.sin(ang) * r;
      a.vx = 0; a.vy = 0;
    });
  }

  machines.forEach((m, mi) => {
    const angle0 = (mi / machines.length) * Math.PI * 2 - Math.PI / 2;
    const mcx = cx + Math.cos(angle0) * machineRingR;
    const mcy = cy + Math.sin(angle0) * machineRingR;

    const groups = [...familyGroups(agents.filter(a => a.node === m)).entries()]
      .map(([fam, members]) => ({
        fam,
        members: [...members].sort((a, b) =>
          Number(isActive(b.id)) - Number(isActive(a.id)) || a.id.localeCompare(b.id)),
        active: members.some(x => isActive(x.id)),
      }))
      .sort((a, b) =>
        Number(b.active) - Number(a.active)
        || b.members.length - a.members.length
        || a.fam.localeCompare(b.fam));

    let idx = 0;
    let ringR = 0;
    while (idx < groups.length) {
      if (ringR === 0) {
        // most important family owns the center
        placeFamily(groups[idx].members, mcx, mcy, angle0);
        ringR = famR(groups[idx].members.length) + 120;
        idx++;
        continue;
      }
      // fill one ring: greedily take families while their diameters fit the circumference
      const ring: typeof groups = [];
      let arc = 0;
      let maxD = 0;
      while (idx < groups.length) {
        const g = groups[idx];
        const need = 2 * famR(g.members.length) + 80;
        if (ring.length > 0 && arc + need > 2 * Math.PI * ringR) break;
        ring.push(g);
        arc += need;
        maxD = Math.max(maxD, 2 * famR(g.members.length));
        idx++;
      }
      let theta = -Math.PI / 2;
      for (const g of ring) {
        const share = ((2 * famR(g.members.length) + 80) / Math.max(arc, 1)) * Math.PI * 2;
        const at = theta + share / 2;
        placeFamily(g.members, mcx + Math.cos(at) * ringR, mcy + Math.sin(at) * ringR, at);
        theta += share;
      }
      ringR += maxD / 2 + 140;
    }
  });

  // Fit-to-viewport: scale the whole constellation down (never up) so outer
  // rings are not cut off by the canvas edges.
  if (agents.length > 1) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of agents) {
      if (a.x < minX) minX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.x > maxX) maxX = a.x;
      if (a.y > maxY) maxY = a.y;
    }
    const scale = Math.min((W - 220) / Math.max(maxX - minX, 1), (H - 160) / Math.max(maxY - minY, 1), 1);
    if (scale < 1) {
      for (const a of agents) {
        a.x = cx + (a.x - cx) * scale;
        a.y = cy + (a.y - cy) * scale;
      }
    }
  }
}

export function layoutCircle(agents: AgentNode[], W: number, H: number) {
  const cx = W * 0.48, cy = H * 0.5;
  const machines = [...new Set(agents.map(a => a.node))];
  const ids = new Set(agents.map(a => a.id));
  const r = Math.min(W, H) * 0.38;
  let idx = 0;
  for (const m of machines) {
    // Families sit adjacent on the ring
    const group = agents.filter(a => a.node === m)
      .sort((a, b) => familyOf(a.id, ids).localeCompare(familyOf(b.id, ids)) || a.id.localeCompare(b.id));
    for (const a of group) {
      const angle = (idx / agents.length) * Math.PI * 2 - Math.PI / 2;
      a.x = cx + Math.cos(angle) * r;
      a.y = cy + Math.sin(angle) * r;
      a.vx = 0; a.vy = 0;
      idx++;
    }
  }
}

export function layoutGrid(agents: AgentNode[], W: number, H: number) {
  const machines = [...new Set(agents.map(a => a.node))];
  const cols = Math.ceil(Math.sqrt(agents.length));
  const cellW = (W - 100) / cols;
  const cellH = (H - 100) / Math.ceil(agents.length / cols);
  let idx = 0;
  for (const m of machines) {
    const group = agents.filter(a => a.node === m);
    for (const a of group) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      a.x = 50 + col * cellW + cellW / 2;
      a.y = 50 + row * cellH + cellH / 2;
      a.vx = 0; a.vy = 0;
      idx++;
    }
  }
}

export function layoutTree(agents: AgentNode[], edges: AgentEdge[], W: number, H: number) {
  const machines = [...new Set(agents.map(a => a.node))];
  const machineW = (W - 60) / machines.length;

  for (let mi = 0; mi < machines.length; mi++) {
    const group = agents.filter(a => a.node === machines[mi]);
    const x = 30 + mi * machineW + machineW / 2;
    // Find root (no buddedFrom in this group)
    const roots = group.filter(a => !a.buddedFrom || !group.some(g => g.id === a.buddedFrom));
    const others = group.filter(a => !roots.includes(a));
    const all = [...roots, ...others];
    const rowH = (H - 100) / Math.max(all.length, 1);
    all.forEach((a, i) => {
      a.x = x + (i % 2 === 0 ? -20 : 20);
      a.y = 50 + i * rowH + rowH / 2;
      a.vx = 0; a.vy = 0;
    });
  }
}

export function simulate(agents: AgentNode[], edges: AgentEdge[], W: number, H: number) {
  const cx = W * 0.48, cy = H * 0.5;

  // Machine cluster centers (arranged in a ring)
  const machines = [...new Set(agents.map(a => a.node))];
  const clusterR = Math.min(W, H) * 0.32;
  const clusterCenters: Record<string, { x: number; y: number }> = {};
  machines.forEach((m, i) => {
    const angle = (i / machines.length) * Math.PI * 2 - Math.PI / 2;
    clusterCenters[m] = { x: cx + Math.cos(angle) * clusterR, y: cy + Math.sin(angle) * clusterR };
  });

  // Family assignment (atlas / atlas-codex / atlas-codex-oracle share one family)
  const ids = new Set(agents.map(a => a.id));
  const famOf = new Map(agents.map(a => [a.id, familyOf(a.id, ids)]));
  const famList = [...new Set(agents.map(a => famOf.get(a.id)!))];

  // Seed each family at its own angle around the machine center so members
  // start together and repulsion doesn't tear the family apart
  const famSeed = new Map<string, { dx: number; dy: number }>();
  famList.forEach((f, i) => {
    const angle = (i / famList.length) * Math.PI * 2;
    const rr = 120 + (i % 3) * 90;
    famSeed.set(f, { dx: Math.cos(angle) * rr, dy: Math.sin(angle) * rr });
  });

  for (const a of agents) {
    const cc = clusterCenters[a.node] || { x: cx, y: cy };
    const seed = famSeed.get(famOf.get(a.id)!)!;
    a.x = cc.x + seed.dx + (Math.random() - 0.5) * 60;
    a.y = cc.y + seed.dy + (Math.random() - 0.5) * 60;
    a.vx = 0;
    a.vy = 0;
  }

  const byId = new Map(agents.map(a => [a.id, a]));

  // Run simulation steps
  for (let iter = 0; iter < 200; iter++) {
    const alpha = 0.3 * (1 - iter / 200);

    // Repulsion: family members pack tight, families keep their distance
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sameFam = famOf.get(a.id) === famOf.get(b.id);
        const minDist = sameFam ? 55 : a.node === b.node ? 115 : 130;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * alpha * 0.5;
          dx *= force; dy *= force;
          a.vx -= dx; a.vy -= dy;
          b.vx += dx; b.vy += dy;
        }
      }
    }

    // Attraction to machine cluster center
    for (const a of agents) {
      const cc = clusterCenters[a.node];
      if (!cc) continue;
      const dx = cc.x - a.x, dy = cc.y - a.y;
      a.vx += dx * alpha * 0.015;
      a.vy += dy * alpha * 0.015;
    }

    // Family cohesion: pull members toward their family centroid
    const famCentroid = new Map<string, { x: number; y: number; n: number }>();
    for (const a of agents) {
      const f = famOf.get(a.id)!;
      const c = famCentroid.get(f) || { x: 0, y: 0, n: 0 };
      c.x += a.x; c.y += a.y; c.n++;
      famCentroid.set(f, c);
    }
    for (const a of agents) {
      const c = famCentroid.get(famOf.get(a.id)!)!;
      if (c.n < 2) continue;
      const dx = c.x / c.n - a.x, dy = c.y / c.n - a.y;
      a.vx += dx * alpha * 0.06;
      a.vy += dy * alpha * 0.06;
    }

    // Edge attraction (sync peers pull toward each other gently)
    for (const edge of edges) {
      if (edge.type !== "sync") continue;
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > 120) {
        const force = (dist - 120) / dist * alpha * 0.02;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }
    }

    // Apply velocity with damping
    for (const a of agents) {
      a.x += a.vx;
      a.y += a.vy;
      a.vx *= 0.7;
      a.vy *= 0.7;
      // Bounds
      a.x = Math.max(40, Math.min(W - 40, a.x));
      a.y = Math.max(40, Math.min(H - 40, a.y));
    }
  }
}
