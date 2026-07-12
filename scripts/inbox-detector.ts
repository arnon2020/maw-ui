/**
 * Headless Inbox ask detector — runs as a systemd --user service on the maw
 * host so blocked agents land in the Inbox even when no browser is open.
 *
 * The browser does the same detection live (src/hooks/useSessions.ts →
 * scanPaneForAsk); this is the always-on backstop. Both share
 * detectAskFromPane and the DETERMINISTIC pane-ask id `pane:<target>:<key>`,
 * so a prompt the client already detected never doubles up here.
 *
 * It is the ONLY component that writes asks while no client is connected, and
 * it always merges onto the current /api/asks — preserving user-set
 * dismissed/answered flags — so it never clobbers a decision made in the UI.
 *
 * Run:  bun scripts/inbox-detector.ts   (via maw-inbox-detector.service)
 */
import { spawnSync } from "child_process";
import { detectAskFromPane } from "../src/lib/askDetect";
import type { AskItem } from "../src/lib/types";

const API = process.env.MAW_API || "http://localhost:3456";
const POLL_MS = 2000;
const RESOLVE_MISSES = 3; // consecutive prompt-free polls before auto-resolving
                          // (3×2s rides out codex reconnect / output-burst flicker)
const MAX_ASKS = 50;

const sh = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { encoding: "utf-8", maxBuffer: 8 << 20 });

/** All tmux panes except maw's own pty helpers. Detection itself filters out
 *  non-dialog panes (detectAskFromPane returns null), so no command sniffing —
 *  which is unreliable anyway (codex reports its command as `node`). */
function panes(): { target: string; name: string }[] {
  const r = sh("tmux", ["list-panes", "-a", "-F", "#{session_name}:#{window_index}|#{window_name}"]);
  if (r.status !== 0) return [];
  return r.stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [target, name] = line.split("|");
    return { target, name: name || target };
  }).filter((p) => !p.target.startsWith("maw-pty-"));
}

function capture(target: string): string {
  const r = sh("tmux", ["capture-pane", "-e", "-p", "-t", target, "-S", "-20"]);
  return r.status === 0 ? r.stdout : "";
}

async function getAsks(): Promise<AskItem[]> {
  try {
    const res = await fetch(`${API}/api/asks`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function putAsks(asks: AskItem[]): Promise<void> {
  await fetch(`${API}/api/asks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asks.slice(0, MAX_ASKS)),
  }).catch(() => {});
}

const miss: Record<string, number> = {};

function resolvePaneAsks(asks: AskItem[], target: string): boolean {
  let changed = false;
  for (const a of asks) {
    if (a.target === target && a.source === "pane" && !a.dismissed) {
      a.dismissed = true;
      a.resolution = a.answeredWith ? "answered" : "resolved";
      changed = true;
    }
  }
  return changed;
}

async function cycle(): Promise<void> {
  const asks = await getAsks();
  const byId = new Map(asks.map((a) => [a.id, a]));
  let changed = false;

  for (const { target, name } of panes()) {
    const det = detectAskFromPane(capture(target));

    if (det) {
      miss[target] = 0;
      const id = `pane:${target}:${det.promptKey}`;
      const prior = byId.get(id);
      if (prior) {
        if (!prior.dismissed) continue; // already pending
        // User's decision stays; a premature auto-resolve gets revived.
        if (prior.resolution === "dismissed" || prior.answeredWith) continue;
        prior.dismissed = false;
        prior.resolution = undefined;
        changed = true;
        continue;
      }
      // A different pending prompt for this pane → the old one is gone.
      resolvePaneAsks(asks, target);
      asks.unshift({
        id, oracle: name, target,
        type: det.type, message: det.question,
        context: det.context, options: det.options,
        promptKey: det.promptKey, respondMode: det.respondMode,
        source: "pane", ts: Date.now(),
      });
      changed = true;
    } else {
      const hasPending = asks.some((a) => a.target === target && a.source === "pane" && !a.dismissed);
      if (!hasPending) { miss[target] = 0; continue; }
      // Captures can drop the prompt for one frame on redraw — debounce.
      miss[target] = (miss[target] || 0) + 1;
      if (miss[target] >= RESOLVE_MISSES) {
        if (resolvePaneAsks(asks, target)) changed = true;
        miss[target] = 0;
      }
    }
  }

  if (changed) await putAsks(asks.slice(0, MAX_ASKS));
}

async function main(): Promise<void> {
  console.log(`[inbox-detector] watching ${API} every ${POLL_MS}ms`);
  // Sequential loop (no overlapping cycles even if one runs long).
  for (;;) {
    try { await cycle(); } catch (e) { console.error("[inbox-detector] cycle error:", e); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
