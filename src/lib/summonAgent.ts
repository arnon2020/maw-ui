export type SummonResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

export type SummonAction =
  | { kind: "notify"; message: string }
  | { kind: "request"; path: "/api/send" | "/api/wake"; body: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function summonAction(
  name: string,
  task: string,
  isLive: boolean,
  sessionId?: string,
): SummonAction {
  const trimmedTask = task.trim();
  if (isLive && !trimmedTask) {
    return {
      kind: "notify",
      message: `${name} is already live at ${sessionId ?? "an active session"}, use Overview to jump`,
    };
  }
  return trimmedTask
    ? { kind: "request", path: "/api/send", body: { target: name, text: trimmedTask } }
    : { kind: "request", path: "/api/wake", body: { target: name, oracle: name } };
}

/**
 * What to say after an accepted summon.
 *
 * `resolved` is the `session:window` maw says this wake actually lands on, and
 * it is NOT always the name that was clicked: a registry window can carry an
 * oracle's name because it shares that oracle's repo, so "summon holmes" once
 * woke `lao-index:scout-oracle`. Showing the resolved target makes that
 * visible here instead of only inside the pane that woke up. Older maw-js /
 * maw-rs builds omit the field — then this reads exactly as it did before.
 */
export function summonSuccessMessage(
  task: string,
  state?: string,
  resolved?: string,
): string {
  const base = task.trim()
    ? state === "queued" ? "Task queued" : "Task sent"
    : "Launch sent";
  return resolved ? `${base} → ${resolved}` : base;
}

export async function launchAgent(
  name: string,
  task: string,
  isLive = false,
  sessionId?: string,
): Promise<SummonResult> {
  const action = summonAction(name, task, isLive, sessionId);
  if (action.kind === "notify") {
    return { ok: false, message: action.message };
  }

  const { apiUrl } = await import("./api");
  const { fetchWithRetry } = await import("./fetchWithRetry");
  try {
    const response = await fetchWithRetry(apiUrl(action.path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action.body),
      // /api/send is non-idempotent. Retry at most once, and only if the
      // browser was already offline before the first attempt (it could not
      // have left the device). A mid-request network change stays ambiguous.
      retrySafety: action.path === "/api/send" ? "offline-only" : "network",
      retryDelays: action.path === "/api/send" ? [750] : undefined,
    });
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const data = isRecord(payload) ? payload : {};
    const error = textField(data.error) ?? textField(data.detail) ?? textField(data.reason);
    if (!response.ok || data.ok === false || error) {
      return {
        ok: false,
        error: error ?? `${response.status} ${response.statusText}`.trim(),
      };
    }

    const state = textField(data.state);
    return {
      ok: true,
      message: summonSuccessMessage(task, state, textField(data.resolved)),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
