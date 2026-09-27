import { jwtDecode } from "jwt-decode";

export const AUTH_TOKEN_KEY = "auth_token";
const LEGACY_TOKEN_KEYS = ["AUTH_TOKEN", "AUTH_TOKEN_KEY"] as const;

export interface AuthHeaders {
  headers?: {
    Authorization: string;
  };
}

export class AuthService {
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

    const decoded = jwtDecode<{ exp?: number }>(token);
    if (typeof decoded.exp === "number" && decoded.exp <= Date.now() / 1000) {
      await AuthService.removeToken();
      return null;
    }

    return token;
  }

  static async getAuthHeader(): Promise<AuthHeaders> {
    const token = await AuthService.getToken();
    return token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : {};
  }
}
