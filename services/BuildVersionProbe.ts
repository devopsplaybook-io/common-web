export const BUILD_MANIFEST_URL = "/_nuxt/builds/latest.json";
export const SHELL_FALLBACK_URL = "/index.html";
export const BUILD_PROBE_TIMEOUT_MS = 10_000;

// Matches `buildId:"x"`, `"buildId": "x"` and `'buildId': 'x'`.
const SHELL_BUILD_ID_PATTERN = /buildId\s*["']?\s*:\s*["']([^"']+)["']/;

export interface BuildVersionProbeOptions {
  fetchImpl?: typeof fetch;
  manifestUrl?: string;
  fallbackShellUrl?: string;
  timeoutMs?: number;
}

export function parseBuildManifest(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const id = (parsed as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseShellBuildId(html: string): string | null {
  const match = SHELL_BUILD_ID_PATTERN.exec(html);
  if (!match) return null;
  const id = match[1]?.trim();
  return id && id.length > 0 ? id : null;
}

function sanitizeTimeout(timeoutMs: number | undefined): number {
  return typeof timeoutMs === "number" &&
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
    ? timeoutMs
    : BUILD_PROBE_TIMEOUT_MS;
}

async function fetchText(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller =
    typeof AbortController === "undefined" ? null : new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (controller) {
      timeout = setTimeout(() => controller.abort(), timeoutMs);
    }
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Build a function that resolves the latest deployed build id. It reads the
 * Nuxt build manifest first and falls back to the shell HTML only when the
 * manifest is unavailable. The returned function never rejects.
 */
export function createBuildVersionProbe(
  options: BuildVersionProbeOptions = {},
): () => Promise<string | null> {
  const manifestUrl = options.manifestUrl ?? BUILD_MANIFEST_URL;
  const fallbackShellUrl = options.fallbackShellUrl ?? SHELL_FALLBACK_URL;
  const timeoutMs = sanitizeTimeout(options.timeoutMs);

  return async (): Promise<string | null> => {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") return null;

    const manifestText = await fetchText(fetchImpl, manifestUrl, timeoutMs);
    const manifestId =
      manifestText === null ? null : parseBuildManifest(manifestText);
    if (manifestId !== null) return manifestId;

    const shellText = await fetchText(fetchImpl, fallbackShellUrl, timeoutMs);
    return shellText === null ? null : parseShellBuildId(shellText);
  };
}
