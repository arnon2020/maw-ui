export type SummonResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function launchAgent(name: string, task: string): Promise<SummonResult> {
  const { apiUrl } = await import("./api");
  const trimmedTask = task.trim();
  const path = trimmedTask ? "/api/send" : "/api/wake";
  const body = trimmedTask
    ? { target: name, text: trimmedTask }
    : { target: name, oracle: name };

  try {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      message: trimmedTask
        ? state === "queued" ? "Task queued" : "Task sent"
        : "Launch sent",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
