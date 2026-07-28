type UnknownRecord = Record<string, unknown>;

export type OracleRegistryResult = {
  names: string[];
  version?: string;
  source: "oracles" | "config";
};

export type OracleRegistryOpenSource = {
  addEventListener: (type: "open", listener: () => void) => void;
  removeEventListener: (type: "open", listener: () => void) => void;
};

type OracleRegistryFetcher = () => Promise<OracleRegistryResult>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalOracleName(value: string): string | null {
  const name = value.trim().replace(/-oracle$/i, "");
  if (!name || name === "default" || name.startsWith("_")) return null;
  return name;
}

function nameFromEntry(value: unknown): string | null {
  if (typeof value === "string") return canonicalOracleName(value);
  if (!isRecord(value)) return null;

  for (const key of ["name", "canonicalName", "oracle", "id"] as const) {
    if (typeof value[key] === "string") return canonicalOracleName(value[key]);
  }
  return null;
}

function addName(names: Set<string>, value: unknown): void {
  const name = nameFromEntry(value);
  if (name) names.add(name);
}

function sortedNames(names: Set<string>): string[] {
  const caseFolded = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!caseFolded.has(key)) caseFolded.set(key, name);
  }
  return [...caseFolded.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function namesFromOracleResponse(payload: unknown): string[] {
  const names = new Set<string>();
  const candidates = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload.oracles ?? payload.agents ?? payload.names
      : null;

  if (Array.isArray(candidates)) {
    for (const candidate of candidates) addName(names, candidate);
  } else if (isRecord(candidates)) {
    for (const [key, candidate] of Object.entries(candidates)) {
      const entryName = nameFromEntry(candidate);
      addName(names, entryName ?? key);
    }
  }

  return sortedNames(names);
}

export function namesFromConfig(payload: unknown): string[] {
  if (!isRecord(payload)) return [];
  const names = new Set<string>();

  for (const key of Object.keys(isRecord(payload.agents) ? payload.agents : {})) {
    addName(names, key);
  }
  for (const key of Object.keys(isRecord(payload.sessions) ? payload.sessions : {})) {
    addName(names, key);
  }
  for (const key of Object.keys(isRecord(payload.commands) ? payload.commands : {})) {
    if (key.endsWith("-oracle")) addName(names, key);
  }

  return sortedNames(names);
}

function responseVersion(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const version = payload.version ?? payload.registryVersion;
  return typeof version === "string" || typeof version === "number"
    ? String(version)
    : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Registry returned invalid JSON");
  }
}

/**
 * Prefer the typed registry endpoint. Older maw servers do not expose it, so
 * fall back to config while still including config.agents (not only commands).
 */
export async function fetchOracleRegistry(signal?: AbortSignal): Promise<OracleRegistryResult> {
  const { apiUrl } = await import("./api");
  const oracleResponse = await fetch(apiUrl("/api/oracles"), { signal });
  if (oracleResponse.ok) {
    const payload = await readJson(oracleResponse);
    const names = namesFromOracleResponse(payload);
    if (names.length === 0) throw new Error("Registry returned no agents");
    return { names, version: responseVersion(payload), source: "oracles" };
  }

  const configResponse = await fetch(apiUrl("/api/config"), { signal });
  if (!configResponse.ok) {
    throw new Error(`Registry refresh failed (${oracleResponse.status}/${configResponse.status})`);
  }
  const payload = await readJson(configResponse);
  const names = namesFromConfig(payload);
  if (names.length === 0) throw new Error("Config returned no agents");
  return { names, version: responseVersion(payload), source: "config" };
}

/**
 * Third registry-refresh trigger: refetch whenever the existing application
 * WebSocket opens or reconnects. Mount and registry-changed remain separate
 * triggers owned by the caller.
 */
export function refetchOracleRegistryOnOpen(
  socket: OracleRegistryOpenSource,
  onSuccess: (result: OracleRegistryResult) => void,
  onError: (error: unknown) => void,
  fetchRegistry: OracleRegistryFetcher = () => fetchOracleRegistry(),
): () => void {
  let active = true;
  const handleOpen = () => {
    void fetchRegistry().then(
      (result) => {
        if (active) onSuccess(result);
      },
      (error) => {
        if (active) onError(error);
      },
    );
  };

  socket.addEventListener("open", handleOpen);
  return () => {
    active = false;
    socket.removeEventListener("open", handleOpen);
  };
}

export function filterOracleNames(names: string[], query: string): string[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return names;
  return names.filter((name) => {
    const searchable = name.toLowerCase().replace(/[-_]/g, " ");
    return terms.every((term) => searchable.includes(term));
  });
}
