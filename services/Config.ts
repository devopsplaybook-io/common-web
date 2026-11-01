export interface AppConfig {
  SERVER_URL: string;
}

const DEFAULT_CONFIG: AppConfig = { SERVER_URL: "/api" };
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function warnAboutInsecureUrl(serverUrl: string): void {
  const inDevelopment =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  if (!inDevelopment) return;

  try {
    const url = new URL(serverUrl);
    if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
      console.warn(
        `[common-web] SERVER_URL uses insecure HTTP: ${url.origin}`,
      );
    }
  } catch {
    // Relative URLs inherit the page scheme and are not checked.
  }
}

export default class Config {
  private static overrides: Partial<AppConfig> = {};

  static async get(): Promise<AppConfig> {
    return { ...DEFAULT_CONFIG, ...Config.overrides };
  }

  static set(config: Partial<AppConfig>): void {
    const next: Partial<AppConfig> = { ...config };
    if (typeof config.SERVER_URL === "string") {
      next.SERVER_URL = normalizeServerUrl(config.SERVER_URL);
      warnAboutInsecureUrl(next.SERVER_URL);
    }
    Config.overrides = { ...Config.overrides, ...next };
  }

  static reset(): void {
    Config.overrides = {};
  }
}
