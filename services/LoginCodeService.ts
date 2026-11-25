/**
 * Client for the cross-device "login with a code" protocol shipped by
 * `@devopsplaybook.io/common-utils` 2.12.0
 * (`docs/login-with-code.md`). Plain ESM TypeScript: no Nuxt or browser
 * globals, so it also runs during SSR.
 *
 * `baseUrl` is the login-code route prefix, not the server root: the default
 * is `Config.SERVER_URL + "/users/login-codes"` (for example
 * `/api/users/login-codes`). A supplied `baseUrl` wins and is trimmed of
 * trailing slashes.
 */
import axios from "axios";
import Config from "./Config";

export type LoginCodeErrorCode =
  | "INVALID_CODE"
  | "ALREADY_USED"
  | "RATE_LIMITED"
  | "LOGIN_CODE_UNAVAILABLE"
  | "PASSWORD_REQUIRED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "TIMEOUT"
  | "ABORTED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "FAILED";

const STABLE_ERROR_CODES = new Set<string>([
  "INVALID_CODE",
  "ALREADY_USED",
  "RATE_LIMITED",
  "LOGIN_CODE_UNAVAILABLE",
  "PASSWORD_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
]);

const ERROR_MESSAGES: Record<LoginCodeErrorCode, string> = {
  INVALID_CODE: "The login code is invalid or expired",
  ALREADY_USED: "The login code was already used",
  RATE_LIMITED: "Too many login code attempts",
  LOGIN_CODE_UNAVAILABLE: "Login with a code is unavailable",
  PASSWORD_REQUIRED: "A password is required to approve this sign-in",
  UNAUTHENTICATED: "Sign in to approve a device",
  FORBIDDEN: "This session cannot approve a sign-in",
  NETWORK: "The login code request could not reach the server",
  TIMEOUT: "The login code request timed out",
  ABORTED: "The login code request was cancelled",
  HTTP_ERROR: "The login code request failed",
  INVALID_RESPONSE: "The server returned an unexpected login code response",
  FAILED: "The login code request failed",
};

/** A typed protocol error. Messages never include codes or request tokens. */
export class LoginCodeError extends Error {
  readonly code: LoginCodeErrorCode;

  readonly status?: number;

  readonly retryable: boolean;

  constructor(
    code: LoginCodeErrorCode,
    message: string = ERROR_MESSAGES[code],
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "LoginCodeError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface LoginCodeCapabilities {
  enabled: boolean;
  available: boolean;
  codeLength: number;
  rotationSeconds: number;
  graceSeconds: number;
  ttlSeconds: number;
  pollIntervalMs: number;
  approveRequiresPassword: boolean;
  serverTime: string;
}

export interface LoginCodeRequest {
  requestToken: string;
  code: string;
  codeExpiresAt: string;
  expiresAt: string;
  serverTime: string;
}

export type LoginCodePollResult =
  | {
      status: "pending";
      code?: string;
      codeExpiresAt: string;
      expiresAt: string;
      serverTime: string;
    }
  | {
      status: "approved";
      token: string;
      user: unknown;
      expiresAt: string;
      serverTime: string;
    }
  | {
      status: "expired" | "cancelled" | "failed";
      expiresAt: string;
      serverTime: string;
    };

export interface LoginCodePreview {
  deviceLabel: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  userName: string;
  serverTime: string;
}

export interface LoginCodeApproval {
  approved: true;
  expiresAt: string;
  serverTime: string;
}

export interface LoginCodeCancellation {
  status: "cancelled";
  serverTime: string;
}

export interface LoginCodeHttpConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Minimal HTTP seam. A caller can pass its own axios instance (with its base
 * URL and interceptors) because axios satisfies this shape at runtime.
 */
export interface LoginCodeHttpClient {
  get<T = unknown>(
    url: string,
    config?: LoginCodeHttpConfig,
  ): Promise<{ data: T }>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: LoginCodeHttpConfig,
  ): Promise<{ data: T }>;
}

export type LoginCodeAuthHeaders =
  | Record<string, string>
  | { headers?: Record<string, string> };

export type LoginCodeAuthHeaderProvider = () =>
  | LoginCodeAuthHeaders
  | undefined
  | Promise<LoginCodeAuthHeaders | undefined>;

export interface LoginCodeServiceOptions {
  baseUrl?: string;
  http?: LoginCodeHttpClient;
  getAuthHeader?: LoginCodeAuthHeaderProvider;
  onSession?: (token: string, user: unknown) => void | Promise<void>;
  timeoutMs?: number;
}

interface LoginCodeRequestOptions {
  signal?: AbortSignal;
}

interface LoginCodePollOptions extends LoginCodeRequestOptions {
  refreshCode?: boolean;
}

interface LoginCodeApprovePayload {
  code: string;
  password?: string;
}

interface ErrorLike {
  code?: unknown;
  name?: unknown;
  response?: { status?: unknown; data?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(message?: string): LoginCodeError {
  return new LoginCodeError("INVALID_RESPONSE", message);
}

function positiveTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 10_000;
}

/** Map any thrown value to a {@link LoginCodeError}. */
export function toLoginCodeError(error: unknown): LoginCodeError {
  if (error instanceof LoginCodeError) return error;

  const candidate = error as ErrorLike | null | undefined;
  const status =
    typeof candidate?.response?.status === "number"
      ? candidate.response.status
      : undefined;
  const data = candidate?.response?.data;
  const bodyCode =
    isRecord(data) && typeof data.code === "string" ? data.code : undefined;

  if (bodyCode && STABLE_ERROR_CODES.has(bodyCode)) {
    const code = bodyCode as LoginCodeErrorCode;
    return new LoginCodeError(code, ERROR_MESSAGES[code], {
      status,
      // Only transient answers are worth retrying; the rest are terminal.
      retryable: code === "RATE_LIMITED",
    });
  }

  if (status === 401) {
    return new LoginCodeError("UNAUTHENTICATED", ERROR_MESSAGES.UNAUTHENTICATED, {
      status,
    });
  }
  if (status === 403) {
    return new LoginCodeError("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN, { status });
  }
  if (status !== undefined) {
    return new LoginCodeError(
      "HTTP_ERROR",
      `${ERROR_MESSAGES.HTTP_ERROR} (status ${status})`,
      { status, retryable: status >= 500 },
    );
  }

  const errorCode = candidate?.code;
  const errorName = candidate?.name;
  if (errorCode === "ECONNABORTED" || errorCode === "ETIMEDOUT") {
    return new LoginCodeError("TIMEOUT", ERROR_MESSAGES.TIMEOUT, {
      retryable: true,
    });
  }
  if (
    errorCode === "ERR_CANCELED" ||
    errorCode === "ABORT_ERR" ||
    errorName === "CanceledError" ||
    errorName === "AbortError"
  ) {
    return new LoginCodeError("ABORTED", ERROR_MESSAGES.ABORTED);
  }

  return new LoginCodeError("NETWORK", ERROR_MESSAGES.NETWORK, {
    retryable: true,
  });
}

export class LoginCodeService {
  private readonly explicitBaseUrl?: string;

  private readonly http: LoginCodeHttpClient;

  private readonly authHeaderProvider?: LoginCodeAuthHeaderProvider;

  private readonly sessionHandler?: (token: string, user: unknown) => void | Promise<void>;

  private readonly timeout: number;

  private resolvedBaseUrl: string | null = null;

  constructor(options: LoginCodeServiceOptions = {}) {
    this.explicitBaseUrl = options.baseUrl;
    // Axios's config type is wider than the seam (it accepts extra fields);
    // it is structurally compatible with the members used here.
    this.http = options.http ?? (axios as unknown as LoginCodeHttpClient);
    this.authHeaderProvider = options.getAuthHeader;
    this.sessionHandler = options.onSession;
    this.timeout = positiveTimeout(options.timeoutMs);
  }

  async capabilities(
    options: LoginCodeRequestOptions = {},
  ): Promise<LoginCodeCapabilities> {
    const data = await this.send<unknown>(
      "get",
      "/capabilities",
      undefined,
      options.signal,
    );
    if (!isRecord(data)) throw invalidResponse();
    return data as unknown as LoginCodeCapabilities;
  }

  async create(options: LoginCodeRequestOptions = {}): Promise<LoginCodeRequest> {
    // The collection route requires the trailing slash.
    const data = await this.send<unknown>("post", "/", undefined, options.signal);
    if (
      !isRecord(data) ||
      typeof data.requestToken !== "string" ||
      typeof data.code !== "string" ||
      typeof data.codeExpiresAt !== "string" ||
      typeof data.expiresAt !== "string"
    ) {
      throw invalidResponse();
    }
    return data as unknown as LoginCodeRequest;
  }

  async poll(
    requestToken: string,
    options: LoginCodePollOptions = {},
  ): Promise<LoginCodePollResult> {
    const body: { requestToken: string; refreshCode?: boolean } = {
      requestToken,
    };
    if (options.refreshCode) body.refreshCode = true;
    const data = await this.send<unknown>("post", "/poll", body, options.signal);
    if (!isRecord(data)) throw invalidResponse();

    const status = data.status;
    if (status === "pending" || status === "expired" || status === "cancelled") {
      return data as unknown as LoginCodePollResult;
    }
    if (status === "failed") {
      return data as unknown as LoginCodePollResult;
    }
    if (status === "approved") {
      if (typeof data.token !== "string") throw invalidResponse();
      if (this.sessionHandler) {
        // The redemption already happened on the server: a failing session
        // writer must not turn a successful login into an error.
        try {
          await this.sessionHandler(data.token, data.user);
        } catch {
          // Ignored on purpose; see above.
        }
      }
      return data as unknown as LoginCodePollResult;
    }

    throw invalidResponse();
  }

  async preview(
    code: string,
    options: LoginCodeRequestOptions = {},
  ): Promise<LoginCodePreview> {
    const data = await this.send<unknown>(
      "post",
      "/preview",
      { code },
      options.signal,
      await this.resolveAuthHeaders(),
    );
    if (!isRecord(data)) throw invalidResponse();
    return data as unknown as LoginCodePreview;
  }

  async approve(
    payload: LoginCodeApprovePayload,
    options: LoginCodeRequestOptions = {},
  ): Promise<LoginCodeApproval> {
    const body: LoginCodeApprovePayload = { code: payload.code };
    if (typeof payload.password === "string" && payload.password.length > 0) {
      body.password = payload.password;
    }
    const data = await this.send<unknown>(
      "post",
      "/approve",
      body,
      options.signal,
      await this.resolveAuthHeaders(),
    );
    if (!isRecord(data)) throw invalidResponse();
    return data as unknown as LoginCodeApproval;
  }

  async cancel(
    requestToken: string,
    options: LoginCodeRequestOptions = {},
  ): Promise<LoginCodeCancellation> {
    const data = await this.send<unknown>(
      "post",
      "/cancel",
      { requestToken },
      options.signal,
    );
    if (!isRecord(data)) throw invalidResponse();
    return data as unknown as LoginCodeCancellation;
  }

  private async resolveAuthHeaders(): Promise<Record<string, string> | undefined> {
    if (!this.authHeaderProvider) return undefined;

    let provided: LoginCodeAuthHeaders | undefined;
    try {
      provided = await this.authHeaderProvider();
    } catch {
      throw new LoginCodeError("UNAUTHENTICATED", ERROR_MESSAGES.UNAUTHENTICATED);
    }
    if (!provided) return undefined;
    if ("headers" in provided && isRecord(provided.headers)) {
      return provided.headers;
    }
    return provided as Record<string, string>;
  }

  private async prefix(): Promise<string> {
    if (this.resolvedBaseUrl !== null) return this.resolvedBaseUrl;

    let prefix: string;
    if (this.explicitBaseUrl !== undefined) {
      prefix = this.explicitBaseUrl;
    } else {
      const config = await Config.get();
      prefix = `${config.SERVER_URL}/users/login-codes`;
    }
    this.resolvedBaseUrl = prefix.trim().replace(/\/+$/, "");
    return this.resolvedBaseUrl;
  }

  private async send<T>(
    method: "get" | "post",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = `${await this.prefix()}${path}`;
    const config: LoginCodeHttpConfig = { signal, timeout: this.timeout };
    if (headers) config.headers = headers;

    try {
      const response =
        method === "get"
          ? await this.http.get<unknown>(url, config)
          : await this.http.post<unknown>(url, body, config);
      return response.data as T;
    } catch (error) {
      throw toLoginCodeError(error);
    }
  }
}

export function createLoginCodeService(
  options: LoginCodeServiceOptions = {},
): LoginCodeService {
  return new LoginCodeService(options);
}
