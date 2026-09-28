import axios from "axios";
import { jwtDecode } from "jwt-decode";
import Config from "./Config";

export const AUTH_TOKEN_KEY = "auth_token";
const LEGACY_TOKEN_KEYS = ["AUTH_TOKEN", "AUTH_TOKEN_KEY"] as const;

interface AuthTokenClaims {
  exp?: number;
  iat?: number;
}

export interface AuthHeaders {
  headers?: {
    Authorization: string;
  };
}

export class AuthService {
  private static renewal:
    | { token: string; promise: Promise<string | null> }
    | null = null;

  static async isAuthenticated(): Promise<boolean> {
    return Boolean(await AuthService.getToken());
  }

  static async saveToken(token: string): Promise<void> {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  }

  static async removeToken(_token?: string): Promise<void> {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  }

  static async getToken(): Promise<string | null> {
    let token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      for (const legacyKey of LEGACY_TOKEN_KEYS) {
        token = localStorage.getItem(legacyKey);
        if (token) {
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          localStorage.removeItem(legacyKey);
          break;
        }
      }
    }

    if (!token) return null;

    const decoded = jwtDecode<AuthTokenClaims>(token);
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

  private static async renewToken(token: string): Promise<string | null> {
    const existing = AuthService.renewal;
    if (existing?.token === token) {
      return existing.promise;
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
    const response = await axios.post<{ token?: unknown }>(
      `${config.SERVER_URL}/users/session/refresh`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const renewedToken = response.data?.token;
    if (typeof renewedToken !== "string" || renewedToken.length === 0) {
      throw new Error("Session renewal response did not include a token");
    }

    if (localStorage.getItem(AUTH_TOKEN_KEY) !== token) {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    }

    await AuthService.saveToken(renewedToken);
    return renewedToken;
  }
}
