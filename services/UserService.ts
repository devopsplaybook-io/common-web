import axios from "axios";
import Config from "./Config";

export interface UserInitializationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cacheTtlMs?: number;
}

type InitializationFailureReason =
  | "timeout"
  | "aborted"
  | "network"
  | `http-${number}`;

const DEFAULT_TIMEOUT_MS = 5_000;

export class UserService {
  private static cache: { url: string; expiresAt: number } | null = null;

  static async isInitialized(
    options: UserInitializationOptions = {},
  ): Promise<boolean> {
    const cacheTtlMs = options.cacheTtlMs ?? 0;
    try {
      const config = await Config.get();
      const url = `${config.SERVER_URL}/users/status/initialization`;

      if (
        cacheTtlMs > 0 &&
        UserService.cache?.url === url &&
        UserService.cache.expiresAt > Date.now()
      ) {
        return true;
      }

      const response = await axios.get<{ initialized: boolean }>(url, {
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const initialized = response.data.initialized === true;

      if (initialized && cacheTtlMs > 0) {
        UserService.cache = { url, expiresAt: Date.now() + cacheTtlMs };
      }

      return initialized;
    } catch (error) {
      console.warn("[common-web] user initialization check failed", {
        reason: UserService.failureReason(error),
      });
      return false;
    }
  }

  private static failureReason(
    error: unknown,
  ): InitializationFailureReason {
    const candidate = error as
      | { code?: unknown; name?: unknown; response?: { status?: unknown } }
      | null
      | undefined;

    if (
      candidate?.code === "ECONNABORTED" ||
      candidate?.code === "ETIMEDOUT"
    ) {
      return "timeout";
    }
    if (
      candidate?.code === "ERR_CANCELED" ||
      candidate?.name === "CanceledError"
    ) {
      return "aborted";
    }

    const status = candidate?.response?.status;
    if (typeof status === "number") return `http-${status}`;

    return "network";
  }
}
