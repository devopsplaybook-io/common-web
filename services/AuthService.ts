import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { EventBus, EventTypes } from "../composables/EventBus";
import Config from "./Config";
import { Timeout } from "./Timeout";

export const AUTH_TOKEN_KEY = "auth_token";
const LEGACY_TOKEN_KEYS = ["AUTH_TOKEN", "AUTH_TOKEN_KEY"] as const;

const RENEWAL_TIMEOUT_MS = 10_000;
const RENEWAL_RETRY_DELAY_MS = 500;
const RENEWAL_FAILURE_COOLDOWN_MS = 30_000;
const RENEWAL_MAX_ATTEMPTS = 2;

interface AuthTokenClaims {
  exp?: number;
  iat?: number;
}

export interface AuthHeaders {
  headers?: {
    Authorization: string;
  };
}

class SessionRenewalError extends Error {
  retryable: boolean;
  status?: number;

  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "SessionRenewalError";
    this.retryable = retryable;
    this.status = status;
  }
}

export class AuthService {
  private static renewal:
    | { token: string; promise: Promise<string | null> }
    | null = null;

  private static renewalFailure: { token: string; at: number } | null = null;

  static async isAuthenticated(): Promise<boolean> {
    return Boolean(await AuthService.getToken());
  }

  static async saveToken(token: string): Promise<void> {
    const storage = AuthService.storage();
    if (!storage) return;
    const previous = storage.getItem(AUTH_TOKEN_KEY);
    storage.setItem(AUTH_TOKEN_KEY, token);
    for (const key of LEGACY_TOKEN_KEYS) storage.removeItem(key);
    if (previous !== token) AuthService.emitAuthUpdated();
  }

  /**
   * Clears every stored token and emits `AUTH_UPDATED`. The optional argument
   * is accepted for API compatibility with older callers and is ignored.
   */
  static async removeToken(_token?: string): Promise<void> {
    const storage = AuthService.storage();
    if (!storage) return;
    const keys = [AUTH_TOKEN_KEY, ...LEGACY_TOKEN_KEYS];
    const present = keys.filter((key) => storage.getItem(key) !== null);
    if (present.length === 0) return;
    for (const key of keys) storage.removeItem(key);
    AuthService.emitAuthUpdated();
  }

  static async getToken(): Promise<string | null> {
    const token = AuthService.readToken();
    if (!token) return null;

    const decoded = AuthService.tryDecode(token);
    if (!decoded) {
      await AuthService.clearSession();
      return null;
    }

    const now = Date.now() / 1000;
    if (typeof decoded.exp === "number" && decoded.exp <= now) {
      await AuthService.removeToken();
      return null;
    }

    if (
      typeof decoded.exp === "number" &&
      typeof decoded.iat === "number" &&
      decoded.exp > decoded.iat &&
      decoded.exp - now <= (decoded.exp - decoded.iat) * 0.2
    ) {
      return AuthService.renewToken(token);
    }

    return token;
  }

  static async getAuthHeader(): Promise<AuthHeaders> {
    const token = await AuthService.getToken();
    return token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : {};
  }

  private static storage(): Storage | null {
    return typeof localStorage === "undefined" ? null : localStorage;
  }

  private static readToken(): string | null {
    const storage = AuthService.storage();
    if (!storage) return null;

    let token = storage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      for (const legacyKey of LEGACY_TOKEN_KEYS) {
        token = storage.getItem(legacyKey);
        if (token) {
          storage.setItem(AUTH_TOKEN_KEY, token);
          storage.removeItem(legacyKey);
          break;
        }
      }
    }

    return token;
  }

  private static tryDecode(token: string): AuthTokenClaims | null {
    try {
      const decoded = jwtDecode<AuthTokenClaims>(token);
      if (typeof decoded !== "object" || decoded === null) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private static async clearSession(): Promise<void> {
    await AuthService.removeToken();
  }

  private static emitAuthUpdated(): void {
    EventBus.emit(EventTypes.AUTH_UPDATED, undefined);
  }

  private static async renewToken(token: string): Promise<string | null> {
    const existing = AuthService.renewal;
    if (existing?.token === token) {
      return existing.promise;
    }

    const failure = AuthService.renewalFailure;
    if (
      failure?.token === token &&
      Date.now() - failure.at < RENEWAL_FAILURE_COOLDOWN_MS
    ) {
      return AuthService.readToken();
    }

    const promise = AuthService.requestTokenRenewal(token);
    AuthService.renewal = { token, promise };
    try {
      return await promise;
    } finally {
      if (AuthService.renewal?.promise === promise) {
        AuthService.renewal = null;
      }
    }
  }

  private static async requestTokenRenewal(
    token: string,
  ): Promise<string | null> {
    const config = await Config.get();

    for (let attempt = 1; attempt <= RENEWAL_MAX_ATTEMPTS; attempt += 1) {
      try {
        const renewedToken = await AuthService.requestRenewedToken(
          config.SERVER_URL,
          token,
        );

        const storedToken = AuthService.readToken();
        if (storedToken !== token) return storedToken;

        await AuthService.saveToken(renewedToken);
        return renewedToken;
      } catch (error) {
        const renewalError = AuthService.asRenewalError(error);

        if (renewalError.status === 401 || renewalError.status === 403) {
          const storedToken = AuthService.readToken();
          if (storedToken !== token) return storedToken;
          await AuthService.clearSession();
          return null;
        }

        if (!renewalError.retryable || attempt === RENEWAL_MAX_ATTEMPTS) {
          return AuthService.handleRenewalFailure(token);
        }

        await Timeout.wait(RENEWAL_RETRY_DELAY_MS);
      }
    }

    return AuthService.handleRenewalFailure(token);
  }

  private static async requestRenewedToken(
    serverUrl: string,
    token: string,
  ): Promise<string> {
    const response = await axios.post<{ token?: unknown }>(
      `${serverUrl}/users/session/refresh`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: RENEWAL_TIMEOUT_MS,
      },
    );

    const renewedToken = response.data?.token;
    if (
      typeof renewedToken !== "string" ||
      renewedToken.trim().length === 0
    ) {
      throw new SessionRenewalError(
        "Session renewal response did not include a token",
        false,
      );
    }

    const decoded = AuthService.tryDecode(renewedToken);
    if (!decoded) {
      throw new SessionRenewalError(
        "Session renewal returned an invalid token",
        false,
      );
    }

    const now = Date.now() / 1000;
    if (
      typeof decoded.exp !== "number" ||
      !Number.isFinite(decoded.exp) ||
      decoded.exp <= now
    ) {
      throw new SessionRenewalError(
        "Session renewal returned a token without a valid expiry",
        false,
      );
    }

    if (
      typeof decoded.iat === "number" &&
      decoded.exp <= decoded.iat
    ) {
      throw new SessionRenewalError(
        "Session renewal returned a token with an inconsistent claim window",
        false,
      );
    }

    return renewedToken;
  }

  private static asRenewalError(error: unknown): SessionRenewalError {
    if (error instanceof SessionRenewalError) return error;

    const candidate = error as
      | { code?: unknown; response?: { status?: unknown } }
      | null
      | undefined;
    const status =
      typeof candidate?.response?.status === "number"
        ? candidate.response.status
        : undefined;

    if (status === 401 || status === 403) {
      return new SessionRenewalError(
        "Session renewal was rejected",
        false,
        status,
      );
    }

    if (candidate?.code === "ECONNABORTED" || candidate?.code === "ETIMEDOUT") {
      return new SessionRenewalError("Session renewal timed out", false, status);
    }

    if (typeof status === "number") {
      return new SessionRenewalError(
        `Session renewal failed with status ${status}`,
        status >= 500,
        status,
      );
    }

    return new SessionRenewalError("Session renewal failed", true, status);
  }

  private static handleRenewalFailure(token: string): string | null {
    const storedToken = AuthService.readToken();
    if (storedToken !== token) return storedToken;

    AuthService.renewalFailure = { token, at: Date.now() };
    return token;
  }
}
