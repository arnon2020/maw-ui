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
  try {
    const response = await fetch(apiUrl(action.path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action.body),
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
      message: task.trim()
        ? state === "queued" ? "Task queued" : "Task sent"
        : "Launch sent",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
