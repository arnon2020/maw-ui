import { useEffect, useMemo, useRef, useState } from "react";
import { filterOracleNames } from "../lib/oracleRegistry";
import { launchAgent, type SummonResult } from "../lib/summonAgent";

const RECENT_KEY = "maw-summon-recent";
const PINNED_KEY = "maw-summon-pinned";

function displayName(name: string): string {
  return name.replace(/-/g, " ");
}

export function showingAgentCount(count: number): string {
  return `Showing ${count} ${count === 1 ? "agent" : "agents"}`;
}

export function shouldConfirmFromWindowKeydown({
  step,
  key,
  shiftKey,
  targetTag,
}: {
  step: "pick" | "confirm";
  key: string;
  shiftKey: boolean;
  targetTag: string;
}): boolean {
  if (step !== "confirm" || key !== "Enter" || shiftKey) return false;
  // INPUT protects the combobox Enter that just changed pick → confirm.
  // BUTTON preserves native Enter behavior for Back and Launch.
  return targetTag !== "INPUT" && targetTag !== "BUTTON";
}

export function launchUiResult(task: string, result: SummonResult): {
  state: "success" | "error";
  message: string;
  task: string;
} {
  if (!result.ok) {
    return {
      state: "error",
      message: result.message ?? result.error ?? "Launch failed",
      task,
    };
  }
  return {
    state: "success",
    message: result.message ?? "Launch sent",
    task: "",
  };
}

function readStoredNames(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredNames(key: string, names: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // Storage can be unavailable in private/locked-down browser contexts.
  }
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
    />
  );
}

type SummonPanelProps = {
  agents: string[];
  liveAgents: Map<string, string>;
  connected: boolean;
  loadingRegistry: boolean;
  registryError: string | null;
  onRetryRegistry: () => void;
};

export function SummonPanel({
  agents,
  liveAgents,
  connected,
  loadingRegistry,
  registryError,
  onRetryRegistry,
}: SummonPanelProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [task, setTask] = useState("");
  const [launchState, setLaunchState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [launchMessage, setLaunchMessage] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readStoredNames(RECENT_KEY).slice(0, 3));
  const [pinned, setPinned] = useState<string[]>(() => readStoredNames(PINNED_KEY));
  const searchRef = useRef<HTMLInputElement>(null);

  const agentSet = useMemo(() => new Set(agents), [agents]);
  const recentAgents = useMemo(() => recent.filter((name) => agentSet.has(name)).slice(0, 3), [recent, agentSet]);
  const pinnedAgents = useMemo(() => pinned.filter((name) => agentSet.has(name)), [pinned, agentSet]);
  const filtered = useMemo(() => filterOracleNames(agents, query), [agents, query]);
  const mayBeStale = !connected || registryError !== null;

  const close = () => {
    if (launchState === "loading") return;
    setOpen(false);
    setStep("pick");
    setSelected("");
    setQuery("");
    setTask("");
    setLaunchState("idle");
    setLaunchMessage("");
  };

  const choose = (name: string) => {
    setSelected(name);
    setStep("confirm");
    setLaunchState("idle");
    setLaunchMessage("");
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      const targetTag = event.target instanceof HTMLElement ? event.target.tagName : "";
      if (
        launchState !== "loading"
        && shouldConfirmFromWindowKeydown({
          step,
          key: event.key,
          shiftKey: event.shiftKey,
          targetTag,
        })
      ) {
        event.preventDefault();
        void confirmLaunch();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open && step === "pick") window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, step]);

  const confirmLaunch = async () => {
    if (!selected || launchState === "loading") return;
    setLaunchState("loading");
    setLaunchMessage(`Launching ${displayName(selected)}...`);
    const sessionId = liveAgents.get(selected.toLowerCase());
    const result = await launchAgent(selected, task, sessionId !== undefined, sessionId);
    const nextUi = launchUiResult(task, result);
    setTask(nextUi.task);
    setLaunchState(nextUi.state);
    setLaunchMessage(nextUi.message);
    if (!result.ok) {
      return;
    }

    const nextRecent = [selected, ...recent.filter((name) => name !== selected)].slice(0, 3);
    setRecent(nextRecent);
    writeStoredNames(RECENT_KEY, nextRecent);
  };

  const togglePinned = (name: string) => {
    const next = pinned.includes(name)
      ? pinned.filter((entry) => entry !== name)
      : [...pinned, name];
    setPinned(next);
    writeStoredNames(PINNED_KEY, next);
  };

  if (!open) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 pt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-3 rounded-lg border px-4 py-2 text-left transition-colors hover:bg-emerald-400/[0.08]"
          style={{ background: "#0d1118", borderColor: "rgba(34,197,94,0.28)" }}
        >
          <span className="font-bold text-emerald-300">Summon agent</span>
          <span className="text-xs font-mono text-white/45">{agents.length} available</span>
          {mayBeStale && (
            <span className="text-xs font-mono text-amber-300" title={registryError ?? "WebSocket disconnected"}>
              List may be stale
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <section className="max-w-[1600px] mx-auto px-6 pt-5" aria-label="Summon an agent">
      <div
        className="overflow-hidden rounded-xl border"
        style={{ background: "#0d1118", borderColor: "rgba(34,197,94,0.28)" }}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3">
          <span className="font-bold text-emerald-300">
            {step === "pick" ? "Choose an agent" : `Confirm ${displayName(selected)}`}
          </span>
          <span className="text-xs font-mono text-white/40">
            {step === "pick" ? "Step 1 of 2" : "Step 2 of 2"}
          </span>
          {mayBeStale && (
            <span className="text-xs font-mono text-amber-300">
              List may be stale{!connected ? " — disconnected" : ""}
            </span>
          )}
          {(registryError || !connected) && (
            <button
              type="button"
              onClick={onRetryRegistry}
              disabled={loadingRegistry}
              className="rounded border border-amber-300/30 px-2 py-1 text-[11px] font-mono text-amber-200 disabled:opacity-50"
            >
              {loadingRegistry ? "Refreshing..." : "Retry"}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            disabled={launchState === "loading"}
            className="ml-auto rounded px-2 py-1 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            aria-label="Cancel summon"
          >
            Cancel <kbd className="ml-1 text-[10px]">Esc</kbd>
          </button>
        </header>

        {step === "pick" ? (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              <label className="mb-2 block text-xs font-mono uppercase tracking-[2px] text-white/45" htmlFor="summon-search">
                Search all agents
              </label>
              <input
                id="summon-search"
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter" && filtered[activeIndex]) {
                    event.preventDefault();
                    choose(filtered[activeIndex]);
                  }
                }}
                placeholder="Type an agent name..."
                autoComplete="off"
                role="combobox"
                aria-controls="summon-agent-list"
                aria-expanded="true"
                aria-activedescendant={filtered[activeIndex] ? `summon-${filtered[activeIndex]}` : undefined}
                className="h-11 w-full rounded-md border bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                style={{ borderColor: "rgba(255,255,255,0.13)" }}
              />
              <div className="mt-2 flex items-center justify-between text-xs font-mono text-white/40">
                <span>{showingAgentCount(filtered.length)}</span>
                <span>↑↓ navigate · Enter select</span>
              </div>

              <div
                id="summon-agent-list"
                role="listbox"
                className="mt-3 max-h-72 overflow-y-auto rounded-md border border-white/[0.08] bg-black/20"
              >
                {filtered.map((name, index) => (
                  <div
                    id={`summon-${name}`}
                    key={name}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="flex min-h-10 items-center border-b border-white/[0.05] last:border-0"
                    style={{ background: index === activeIndex ? "rgba(34,197,94,0.1)" : undefined }}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(name)}
                      className="min-w-0 flex-1 px-3 py-2 text-left text-sm font-mono text-white/75 hover:text-emerald-200"
                    >
                      {displayName(name)}
                    </button>
                    <AgentStatusBadge name={name} liveAgents={liveAgents} />
                    <button
                      type="button"
                      onClick={() => togglePinned(name)}
                      className="mr-2 h-8 w-8 rounded text-base text-amber-300/70 hover:bg-white/[0.06]"
                      aria-label={pinned.includes(name) ? `Unpin ${displayName(name)}` : `Pin ${displayName(name)}`}
                      title={pinned.includes(name) ? "Unpin agent" : "Pin agent"}
                    >
                      {pinned.includes(name) ? "★" : "☆"}
                    </button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm font-mono text-white/35">No matching agents</div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <QuickRow title="Recent" empty="Launches appear here" names={recentAgents} onChoose={choose} />
              <QuickRow title="Pinned" empty="Use ☆ to pin agents" names={pinnedAgents} onChoose={choose} />
            </aside>
          </div>
        ) : (
          <form
            className="p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmLaunch();
            }}
          >
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <div className="text-xs font-mono uppercase tracking-[2px] text-white/40">Selected agent</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold capitalize text-emerald-200">{displayName(selected)}</span>
                <AgentStatusBadge name={selected} liveAgents={liveAgents} />
              </div>
            </div>
            <label className="mt-4 block text-xs font-mono uppercase tracking-[2px] text-white/45" htmlFor="summon-task">
              Task (optional)
            </label>
            <textarea
              id="summon-task"
              value={task}
              onChange={(event) => {
                setTask(event.target.value);
                if (launchState !== "loading") {
                  setLaunchState("idle");
                  setLaunchMessage("");
                }
              }}
              rows={3}
              disabled={launchState === "loading" || launchState === "success"}
              placeholder="Add a task, or leave blank to wake the agent..."
              className="mt-2 w-full rounded-md border bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400 disabled:opacity-60"
              style={{ borderColor: "rgba(255,255,255,0.13)" }}
            />
            <p className="mt-2 text-[11px] font-mono text-white/35">Enter launches · Shift+Enter adds a new line · Escape cancels</p>

            <div aria-live="polite" className="mt-4 min-h-5 text-sm font-mono">
              {launchState !== "idle" && (
                <span
                  className={launchState === "error" ? "text-red-400" : launchState === "success" ? "text-emerald-300" : "text-amber-200"}
                >
                  {launchMessage}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep("pick");
                  setLaunchState("idle");
                  setLaunchMessage("");
                }}
                disabled={launchState === "loading"}
                className="h-11 rounded-md border border-white/[0.12] px-4 text-sm font-bold text-white/60 disabled:opacity-40"
              >
                Back
              </button>
              {launchState === "success" ? (
                <button
                  type="button"
                  onClick={close}
                  className="h-11 rounded-md bg-emerald-400 px-5 text-sm font-bold text-black"
                >
                  Done
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={launchState === "loading"}
                  className="flex h-11 items-center gap-2 rounded-md bg-emerald-400 px-5 text-sm font-bold text-black disabled:cursor-wait disabled:opacity-70"
                >
                  {launchState === "loading" && <Spinner />}
                  {launchState === "loading" ? `Launching ${displayName(selected)}...` : `Launch ${displayName(selected)}`}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export function AgentStatusBadge({
  name,
  liveAgents,
}: {
  name: string;
  liveAgents: Map<string, string>;
}) {
  const sessionId = liveAgents.get(name.toLowerCase());
  if (sessionId) {
    return (
      <span
        className="whitespace-nowrap rounded bg-emerald-400/[0.12] px-2 py-1 text-[10px] font-bold font-mono text-emerald-300"
        aria-label={`${displayName(name)} status: live at ${sessionId}`}
      >
        LIVE · {sessionId}
      </span>
    );
  }
  return (
    <span
      className="whitespace-nowrap rounded bg-white/[0.04] px-2 py-1 text-[10px] font-bold font-mono text-white/35"
      aria-label={`${displayName(name)} status: dormant`}
    >
      DORMANT
    </span>
  );
}

function QuickRow({
  title,
  empty,
  names,
  onChoose,
}: {
  title: string;
  empty: string;
  names: string[];
  onChoose: (name: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-mono uppercase tracking-[2px] text-white/45">{title}</div>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => (
          <button
            type="button"
            key={name}
            onClick={() => onChoose(name)}
            className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-mono capitalize text-white/65 hover:border-emerald-400/40 hover:text-emerald-200"
          >
            {displayName(name)}
          </button>
        ))}
        {names.length === 0 && <span className="text-xs font-mono text-white/25">{empty}</span>}
      </div>
    </div>
  );
}
