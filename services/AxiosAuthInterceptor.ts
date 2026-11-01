import axios, { AxiosHeaders } from "axios";
import type {
  AxiosInstance,
  InternalAxiosRequestConfig,
  RawAxiosHeaders,
} from "axios";
import { AuthService } from "./AuthService";
import Config from "./Config";

const REGISTRATION_MARKER = Symbol.for("common-web.axios-auth");
const TOKEN_CONTEXT = Symbol("common-web.axios-auth-token");

const DEFAULT_LOGIN_PATHS = ["/users/session"];

export interface AxiosAuthInterceptorOptions {
  /** Extra origins (for example `https://analytics.example.com`) that may receive the token. */
  allowedOrigins?: string[];
  /** Path suffixes exempt from the 401 session clear (for example `/auth/login`). */
  loginPaths?: string[];
}

type MarkedAxiosInstance = AxiosInstance & {
  [key: symbol]: unknown;
};

type TokenContextConfig = InternalAxiosRequestConfig & {
  [TOKEN_CONTEXT]?: string;
};

function pageOrigin(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const origin = window.location.origin;
  return origin && origin !== "null" ? origin : null;
}

function absoluteOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

function normalizeOrigins(origins: string[]): Set<string> {
  return new Set(
    origins.map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        throw new TypeError(`Invalid allowed origin: ${entry}`);
      }
    }),
  );
}

function normalizeLoginPaths(paths: string[]): string[] {
  return paths
    .map((path) => {
      try {
        return new URL(path, "http://localhost").pathname.replace(/\/+$/, "");
      } catch {
        return path.replace(/[?#].*$/, "").replace(/\/+$/, "");
      }
    })
    .filter((path) => path.length > 0);
}

function isAllowedTarget(
  uri: string,
  serverOrigin: string | null,
  allowedOrigins: Set<string>,
): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    if (!uri.startsWith("//")) {
      // Relative URLs inherit the page origin, so they are always allowed.
      return true;
    }
    const origin = pageOrigin();
    if (!origin) return false;
    try {
      url = new URL(uri, origin);
    } catch {
      return false;
    }
  }

  if (url.origin === "null") return false;
  if (url.origin === pageOrigin()) return true;
  if (serverOrigin !== null && url.origin === serverOrigin) return true;
  return allowedOrigins.has(url.origin);
}

function effectiveUri(
  instance: AxiosInstance,
  config: InternalAxiosRequestConfig,
): string {
  try {
    return instance.getUri(config);
  } catch {
    // Axios rejects some special-scheme URLs while building the full path;
    // fall back to the raw target so the origin check can still fail closed.
    return typeof config.url === "string" ? config.url : "";
  }
}

function isLoginRequest(
  instance: AxiosInstance,
  config: InternalAxiosRequestConfig,
  loginPaths: string[],
): boolean {
  let uri: string;
  try {
    uri = instance.getUri(config);
  } catch {
    return false;
  }

  let pathname: string;
  try {
    pathname = new URL(uri, "http://localhost").pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }

  return loginPaths.some(
    (loginPath) => pathname === loginPath || pathname.endsWith(loginPath),
  );
}

function sentBearerToken(headers: unknown): string | null {
  if (typeof headers !== "object" || headers === null) return null;
  const parsed = AxiosHeaders.from(headers as RawAxiosHeaders);
  const value = parsed.get("Authorization");
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1];
  return token ? token.trim() : null;
}

export function registerAxiosAuthInterceptors(
  instance: AxiosInstance = axios,
  options: AxiosAuthInterceptorOptions = {},
): boolean {
  const marked = instance as MarkedAxiosInstance;
  if (marked[REGISTRATION_MARKER]) {
    return false;
  }

  // Validate options before marking the instance so a failed registration
  // leaves it reusable.
  const allowedOrigins = normalizeOrigins(options.allowedOrigins ?? []);
  const loginPaths = normalizeLoginPaths(
    options.loginPaths ?? DEFAULT_LOGIN_PATHS,
  );

  marked[REGISTRATION_MARKER] = true;

  instance.interceptors.request.use(async (config) => {
    const headers = AxiosHeaders.from(config.headers);
    if (headers.get("Authorization") != null) {
      return config;
    }

    const uri = effectiveUri(instance, config);
    const { SERVER_URL } = await Config.get();
    if (!isAllowedTarget(uri, absoluteOrigin(SERVER_URL), allowedOrigins)) {
      return config;
    }

    const token = await AuthService.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
      (config as TokenContextConfig)[TOKEN_CONTEXT] = token;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (
        error?.response?.status === 401 &&
        error?.config &&
        !isLoginRequest(instance, error.config, loginPaths)
      ) {
        const config = error.config as TokenContextConfig;
        const sentToken =
          config[TOKEN_CONTEXT] ?? sentBearerToken(config.headers);
        if (sentToken) await AuthService.removeToken(sentToken);
      }
      return Promise.reject(error);
    },
  );

  return true;
}
