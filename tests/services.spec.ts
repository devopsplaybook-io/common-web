import axios from "axios";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import Config from "@devopsplaybook.io/common-web/services/Config";
import { PreferencesService } from "@devopsplaybook.io/common-web/services/PreferencesService";
import { RefreshIntervalService } from "@devopsplaybook.io/common-web/services/RefreshIntervalService";
import { Timeout } from "@devopsplaybook.io/common-web/services/Timeout";
import { UserService } from "@devopsplaybook.io/common-web/services/UserService";
import {
  EventBus,
  EventTypes,
} from "@devopsplaybook.io/common-web/composables/EventBus";

function tokenFromPayload(payload: unknown): string {
  const encoded = btoa(JSON.stringify(payload));
  return `header.${encoded}.signature`;
}

function tokenWithExpiry(
  exp: number,
  iat = Math.floor(Date.now() / 1000),
): string {
  return tokenFromPayload({ exp, iat });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  Config.reset();
  EventBus.all.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shared services", () => {
  it("reads legacy auth storage keys and migrates to auth_token", async () => {
    const token = tokenWithExpiry(Date.now() / 1000 + 3600);
    localStorage.setItem("AUTH_TOKEN", token);
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      expect(await AuthService.getToken()).toBe(token);
      expect(localStorage.getItem("auth_token")).toBe(token);
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(await AuthService.getAuthHeader()).toEqual({
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("removes expired tokens and reports unauthenticated", async () => {
    localStorage.setItem("auth_token", tokenWithExpiry(1));
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      expect(await AuthService.isAuthenticated()).toBe(false);
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("returns the current token immediately and renews in the background", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3600);
    const renewedToken = tokenWithExpiry(now + 3600);
    localStorage.setItem("auth_token", oldToken);
    const pending = deferred<{ data: { token: string } }>();
    const post = vi.spyOn(axios, "post").mockReturnValue(pending.promise);
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBe(oldToken);
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(post).toHaveBeenCalledWith(
        "/api/users/session/refresh",
        {},
        {
          headers: { Authorization: `Bearer ${oldToken}` },
          timeout: 3_000,
        },
      );
      expect(localStorage.getItem("auth_token")).toBe(oldToken);

      pending.resolve({ data: { token: renewedToken } });
      await flushPromises();

      expect(localStorage.getItem("auth_token")).toBe(renewedToken);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(AuthService.getToken()).resolves.toBe(renewedToken);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("does not renew a token while it has most of its lifetime remaining", async () => {
    const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem("auth_token", token);
    const post = vi.spyOn(axios, "post");

    expect(await AuthService.getToken()).toBe(token);
    expect(post).not.toHaveBeenCalled();
  });

  it("uses the API base and a default timeout for the initialization check", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });

    expect(await Config.get()).toEqual({ SERVER_URL: "/api" });
    expect(await UserService.isInitialized()).toBe(true);
    expect(get).toHaveBeenCalledWith("/api/users/status/initialization", {
      timeout: 5_000,
    });
  });

  it("stores preferences and uses the default refresh interval", () => {
    expect(RefreshIntervalService.get()).toBe("10000");
    RefreshIntervalService.set("5000");
    expect(RefreshIntervalService.get()).toBe("5000");

    PreferencesService.set("density", "compact");
    expect(PreferencesService.get("density")).toBe("compact");
    PreferencesService.remove("density");
    expect(PreferencesService.get("density")).toBeNull();
  });

  it("resolves Timeout.wait after the requested delay", async () => {
    vi.useFakeTimers();
    const wait = Timeout.wait(250);
    vi.advanceTimersByTime(249);
    let settled = false;
    void wait.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    await wait;
    expect(settled).toBe(true);
  });
});

describe("auth state events", () => {
  it("emits once when a token is saved and stays silent for an identical save", async () => {
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
      await AuthService.saveToken(token);
      expect(listener).toHaveBeenCalledTimes(1);

      await AuthService.saveToken(token);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("emits once when a stored token is removed and not when nothing is stored", async () => {
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await AuthService.removeToken();
      expect(listener).not.toHaveBeenCalled();

      await AuthService.saveToken(
        tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600),
      );
      expect(listener).toHaveBeenCalledTimes(1);

      await AuthService.removeToken();
      expect(listener).toHaveBeenCalledTimes(2);

      await AuthService.removeToken();
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("emits once when a legacy token has to be removed", async () => {
    localStorage.setItem("AUTH_TOKEN_KEY", "legacy-token");
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await AuthService.removeToken();
      expect(localStorage.getItem("AUTH_TOKEN_KEY")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("removeToken(token) keeps a newer token and clears the matching token once", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 3600, now - 1000);
    const newerToken = tokenWithExpiry(now + 7200, now);
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await AuthService.saveToken(oldToken);
      await AuthService.saveToken(newerToken);
      expect(listener).toHaveBeenCalledTimes(2);

      await AuthService.removeToken(oldToken);
      expect(localStorage.getItem("auth_token")).toBe(newerToken);
      expect(listener).toHaveBeenCalledTimes(2);

      await AuthService.removeToken(newerToken);
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(3);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });
});

describe("Config injection", () => {
  it("returns the default configuration and allows overrides", async () => {
    expect(await Config.get()).toEqual({ SERVER_URL: "/api" });

    Config.set({ SERVER_URL: "https://api.example.com" });
    expect(await Config.get()).toEqual({
      SERVER_URL: "https://api.example.com",
    });

    Config.reset();
    expect(await Config.get()).toEqual({ SERVER_URL: "/api" });
  });

  it("routes UserService through the injected server URL", async () => {
    Config.set({ SERVER_URL: "https://api.example.com" });
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });

    expect(await UserService.isInitialized()).toBe(true);
    expect(get).toHaveBeenCalledWith(
      "https://api.example.com/users/status/initialization",
      { timeout: 5_000 },
    );
  });
});

describe("Config URL normalisation", () => {
  it("trims whitespace and strips trailing slashes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    Config.set({ SERVER_URL: "https://api.example.com///" });
    expect(await Config.get()).toEqual({
      SERVER_URL: "https://api.example.com",
    });

    Config.set({ SERVER_URL: " /api/ " });
    expect(await Config.get()).toEqual({ SERVER_URL: "/api" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about insecure non-loopback HTTP URLs in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    Config.set({ SERVER_URL: "http://api.example.com" });
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockClear();
    Config.set({ SERVER_URL: "http://localhost:8080" });
    Config.set({ SERVER_URL: "http://127.0.0.1:8080" });
    Config.set({ SERVER_URL: "http://[::1]:8080" });
    Config.set({ SERVER_URL: "https://api.example.com" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    Config.set({ SERVER_URL: "http://api.example.com" });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("UserService.isInitialized", () => {
  it("resolves the initialization flag from the endpoint", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: false },
    });
    await expect(UserService.isInitialized()).resolves.toBe(false);

    vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });
    await expect(UserService.isInitialized()).resolves.toBe(true);
  });

  it("forwards a custom timeout and abort signal", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });
    const controller = new AbortController();

    await UserService.isInitialized({
      timeoutMs: 250,
      signal: controller.signal,
    });

    expect(get).toHaveBeenCalledWith("/api/users/status/initialization", {
      timeout: 250,
      signal: controller.signal,
    });
  });

  it.each([
    {
      label: "an axios timeout",
      error: { isAxiosError: true, code: "ECONNABORTED" },
      reason: "timeout",
    },
    {
      label: "an ETIMEDOUT",
      error: { isAxiosError: true, code: "ETIMEDOUT" },
      reason: "timeout",
    },
    {
      label: "an aborted request",
      error: { isAxiosError: true, code: "ERR_CANCELED" },
      reason: "aborted",
    },
    {
      label: "a cancelled request",
      error: { isAxiosError: true, name: "CanceledError" },
      reason: "aborted",
    },
    {
      label: "an HTTP failure",
      error: { isAxiosError: true, response: { status: 500 } },
      reason: "http-500",
    },
    {
      label: "a network error",
      error: new Error("network is down"),
      reason: "network",
    },
  ])(
    "resolves false and logs the reason for $label",
    async ({ error, reason }) => {
      vi.spyOn(axios, "get").mockRejectedValue(error);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(UserService.isInitialized()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith(
        "[common-web] user initialization check failed",
        { reason },
      );
    },
  );

  it("reuses a successful result within the cache TTL and refetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    Config.set({ SERVER_URL: "/api/cache-a" });
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });

    await expect(UserService.isInitialized({ cacheTtlMs: 1000 })).resolves.toBe(
      true,
    );
    await expect(UserService.isInitialized({ cacheTtlMs: 1000 })).resolves.toBe(
      true,
    );
    expect(get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1001);
    await expect(UserService.isInitialized({ cacheTtlMs: 1000 })).resolves.toBe(
      true,
    );
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("never caches false and bypasses the cache when disabled", async () => {
    Config.set({ SERVER_URL: "/api/cache-b" });
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: false },
    });

    await UserService.isInitialized({ cacheTtlMs: 1000 });
    await UserService.isInitialized({ cacheTtlMs: 1000 });
    expect(get).toHaveBeenCalledTimes(2);

    get.mockResolvedValue({ data: { initialized: true } });
    await UserService.isInitialized();
    await UserService.isInitialized();
    expect(get).toHaveBeenCalledTimes(4);
  });
});

describe("RefreshIntervalService", () => {
  it("falls back to the default when no value is stored", () => {
    expect(RefreshIntervalService.get()).toBe(RefreshIntervalService.DEFAULT);
  });

  it.each(["abc", "-1", "1.5", "", " "])(
    "falls back to the default for the malformed stored value %j",
    (value) => {
      localStorage.setItem(RefreshIntervalService.KEY, value);
      expect(RefreshIntervalService.get()).toBe(
        RefreshIntervalService.DEFAULT,
      );
    },
  );

  it("normalises stored and supplied values", () => {
    localStorage.setItem(RefreshIntervalService.KEY, "05000");
    expect(RefreshIntervalService.get()).toBe("5000");

    RefreshIntervalService.set("007500");
    expect(RefreshIntervalService.get()).toBe("7500");
    expect(localStorage.getItem(RefreshIntervalService.KEY)).toBe("7500");
  });

  it("accepts zero to keep polling disabled", () => {
    RefreshIntervalService.set("0");
    expect(RefreshIntervalService.get()).toBe("0");
  });

  it("rejects invalid values without touching the stored value", () => {
    RefreshIntervalService.set("5000");

    expect(() => RefreshIntervalService.set("abc")).toThrow(TypeError);
    expect(() => RefreshIntervalService.set("1.5")).toThrow(TypeError);
    expect(localStorage.getItem(RefreshIntervalService.KEY)).toBe("5000");
  });
});

describe("SSR-safe storage access", () => {
  function throwingStorage(): Storage {
    const blocked = (): never => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    return {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
      clear: blocked,
      key: blocked,
      length: 0,
    } as unknown as Storage;
  }

  function blockStorageAccess(): () => void {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    return () => {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
      else Reflect.deleteProperty(window, "localStorage");
    };
  }

  it("treats preferences as empty when localStorage is undefined", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(PreferencesService.get("density")).toBeNull();
    expect(() => PreferencesService.set("density", "compact")).not.toThrow();
    expect(() => PreferencesService.remove("density")).not.toThrow();
  });

  it("treats preferences as empty when storage methods throw", () => {
    vi.stubGlobal("localStorage", throwingStorage());

    expect(PreferencesService.get("density")).toBeNull();
    expect(() => PreferencesService.set("density", "compact")).not.toThrow();
    expect(() => PreferencesService.remove("density")).not.toThrow();
  });

  it("treats preferences as empty when storage access throws", () => {
    const restore = blockStorageAccess();
    try {
      expect(PreferencesService.get("density")).toBeNull();
      expect(() => PreferencesService.set("density", "compact")).not.toThrow();
      expect(() => PreferencesService.remove("density")).not.toThrow();
    } finally {
      restore();
    }
  });

  it("falls back to the default refresh interval when localStorage is undefined", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(RefreshIntervalService.get()).toBe(RefreshIntervalService.DEFAULT);
    expect(() => RefreshIntervalService.set("5000")).not.toThrow();
    expect(() => RefreshIntervalService.set("abc")).toThrow(TypeError);
  });

  it("falls back to the default refresh interval when storage methods throw", () => {
    vi.stubGlobal("localStorage", throwingStorage());

    expect(RefreshIntervalService.get()).toBe(RefreshIntervalService.DEFAULT);
    expect(() => RefreshIntervalService.set("5000")).not.toThrow();
    expect(() => RefreshIntervalService.set("1.5")).toThrow(TypeError);
  });

  it("falls back to the default refresh interval when storage access throws", () => {
    const restore = blockStorageAccess();
    try {
      expect(RefreshIntervalService.get()).toBe(
        RefreshIntervalService.DEFAULT,
      );
      expect(() => RefreshIntervalService.set("5000")).not.toThrow();
    } finally {
      restore();
    }
  });

  it("rejects unsafe-integer values even when they are digits", () => {
    localStorage.setItem(RefreshIntervalService.KEY, "99999999999999999999");
    expect(RefreshIntervalService.get()).toBe(RefreshIntervalService.DEFAULT);

    expect(() =>
      RefreshIntervalService.set("99999999999999999999"),
    ).toThrow(TypeError);
  });
});

describe("AuthService session hardening", () => {
  it("treats a corrupt stored token as signed out", async () => {
    localStorage.setItem("auth_token", "not-a-jwt");
    localStorage.setItem("AUTH_TOKEN", "legacy-corrupt");
    localStorage.setItem("AUTH_TOKEN_KEY", "legacy-corrupt-key");
    const listener = vi.fn();
    const post = vi.spyOn(axios, "post");
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBeNull();
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN_KEY")).toBeNull();
      expect(post).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("treats a corrupt migrated legacy token as signed out", async () => {
    localStorage.setItem("AUTH_TOKEN", "not-a-jwt");
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBeNull();
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("keeps auth helpers non-throwing for a corrupt token", async () => {
    localStorage.setItem("auth_token", "not-a-jwt");

    await expect(AuthService.isAuthenticated()).resolves.toBe(false);
    await expect(AuthService.getAuthHeader()).resolves.toEqual({});
  });

  it.each([
    { label: "a string exp", payload: { exp: "1762000000" } },
    {
      label: "a string iat",
      payload: {
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: "1700000000",
      },
    },
    { label: "a null exp", payload: { exp: null } },
    { label: "an array payload", payload: [1, 2, 3] },
    { label: "a string payload", payload: "not-an-object" },
  ])("treats $label as a corrupt token", async ({ payload }) => {
    localStorage.setItem("auth_token", tokenFromPayload(payload));
    localStorage.setItem("AUTH_TOKEN", "legacy-token");
    const listener = vi.fn();
    const post = vi.spyOn(axios, "post");
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBeNull();
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(post).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("accepts a token without exp or iat claims", async () => {
    const token = tokenFromPayload({ sub: "user" });
    localStorage.setItem("auth_token", token);

    await expect(AuthService.getToken()).resolves.toBe(token);
  });

  it("returns the current token when renewal times out and pauses retries", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3601);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, code: "ECONNABORTED" });
    const failed = vi.fn();
    EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.waitFor(() =>
        expect(failed).toHaveBeenCalledWith({ reason: "timeout" }),
      );
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        "/api/users/session/refresh",
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 3_000,
        },
      );
      expect(localStorage.getItem("auth_token")).toBe(token);

      await expect(AuthService.getToken()).resolves.toBe(token);
      await flushPromises();
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
    }
  });

  it("retries a network failure once, emits network and pauses renewal for that token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:10:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3602);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue(new Error("network is down"));
    const failed = vi.fn();
    EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.advanceTimersByTimeAsync(0);
      expect(post).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(post).toHaveBeenCalledTimes(2);
      expect(failed).toHaveBeenCalledTimes(1);
      expect(failed).toHaveBeenCalledWith({ reason: "network" });

      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.advanceTimersByTimeAsync(0);
      expect(post).toHaveBeenCalledTimes(2);

      vi.setSystemTime(Date.now() + 30_001);
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.advanceTimersByTimeAsync(0);
      expect(post).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(500);
      expect(post).toHaveBeenCalledTimes(4);
    } finally {
      EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
    }
  });

  it("retries a 5xx renewal failure once and emits 5xx", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:20:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3603);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
    const failed = vi.fn();
    EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.advanceTimersByTimeAsync(500);

      expect(post).toHaveBeenCalledTimes(2);
      expect(failed).toHaveBeenCalledWith({ reason: "5xx" });
      expect(localStorage.getItem("auth_token")).toBe(token);
    } finally {
      EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
    }
  });

  it("clears the session when renewal is rejected with 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3604);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    const listener = vi.fn();
    const failed = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);
    EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.waitFor(() =>
        expect(localStorage.getItem("auth_token")).toBeNull(),
      );
      expect(post).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN_KEY")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(failed).not.toHaveBeenCalled();
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
      EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
    }
  });

  it("clears the session when renewal is rejected with 403", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3605);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.waitFor(() =>
        expect(localStorage.getItem("auth_token")).toBeNull(),
      );
      expect(post).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
    }
  });

  it("shares one renewal request between concurrent calls", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3606);
    const renewedToken = tokenWithExpiry(now + 3600, now);
    localStorage.setItem("auth_token", token);
    const pending = deferred<{ data: { token: string } }>();
    const post = vi.spyOn(axios, "post").mockReturnValue(pending.promise);

    const first = await AuthService.getToken();
    const second = await AuthService.getToken();
    expect(first).toBe(token);
    expect(second).toBe(token);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    pending.resolve({ data: { token: renewedToken } });
    await flushPromises();

    expect(post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("auth_token")).toBe(renewedToken);
  });

  it("keeps a newer token saved while a renewal is in flight", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3607);
    const newerToken = tokenWithExpiry(now + 7200, now);
    const renewedToken = tokenWithExpiry(now + 3600, now);
    localStorage.setItem("auth_token", oldToken);
    const pending = deferred<{ data: { token: string } }>();
    vi.spyOn(axios, "post").mockReturnValue(pending.promise);

    await expect(AuthService.getToken()).resolves.toBe(oldToken);
    await AuthService.saveToken(newerToken);
    pending.resolve({ data: { token: renewedToken } });
    await flushPromises();

    expect(localStorage.getItem("auth_token")).toBe(newerToken);
  });

  it("does not clear a re-established session on a stale 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3608);
    const newerToken = tokenWithExpiry(now + 7200, now + 1);
    localStorage.setItem("auth_token", oldToken);
    const pending = deferred<{ data: { token: string } }>();
    vi.spyOn(axios, "post").mockReturnValue(pending.promise);

    await expect(AuthService.getToken()).resolves.toBe(oldToken);
    await AuthService.saveToken(newerToken);
    pending.reject({ isAxiosError: true, response: { status: 401 } });
    await flushPromises();

    expect(localStorage.getItem("auth_token")).toBe(newerToken);
  });

  it("does not emit a renewal failure when a newer token replaced the failed one", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3609);
    const newerToken = tokenWithExpiry(now + 7200, now);
    localStorage.setItem("auth_token", oldToken);
    const pending = deferred<{ data: { token: string } }>();
    vi.spyOn(axios, "post").mockReturnValue(pending.promise);
    const failed = vi.fn();
    EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

    try {
      await expect(AuthService.getToken()).resolves.toBe(oldToken);
      await AuthService.saveToken(newerToken);
      pending.reject({ isAxiosError: true, response: { status: 503 } });
      await flushPromises();

      expect(failed).not.toHaveBeenCalled();
      expect(localStorage.getItem("auth_token")).toBe(newerToken);
    } finally {
      EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
    }
  });

  it.each([
    { label: "a missing token", data: {}, offset: 11 },
    { label: "an empty token", data: { token: "" }, offset: 12 },
    { label: "a non-JWT token", data: { token: "not-a-jwt" }, offset: 13 },
    {
      label: "an expired token",
      data: { token: tokenFromPayload({ exp: 1, iat: 1 }) },
      offset: 14,
    },
    {
      label: "a token without expiry",
      data: { token: tokenFromPayload({ iat: 1_700_000_000 }) },
      offset: 15,
    },
    {
      label: "a token with a string expiry",
      data: {
        token: tokenFromPayload({
          exp: String(Math.floor(Date.now() / 1000) + 100),
          iat: Math.floor(Date.now() / 1000),
        }),
      },
      offset: 17,
    },
    {
      label: "a token with an inconsistent claim window",
      data: {
        token: tokenFromPayload({
          exp: Math.floor(Date.now() / 1000) + 100,
          iat: Math.floor(Date.now() / 1000) + 200,
        }),
      },
      offset: 16,
    },
  ])(
    "returns the current token and emits invalid-response when renewal returns $label",
    async ({ data, offset }) => {
      const now = Math.floor(Date.now() / 1000);
      const token = tokenWithExpiry(now + 100, now - 3600 - offset);
      localStorage.setItem("auth_token", token);
      const post = vi.spyOn(axios, "post").mockResolvedValue({ data });
      const failed = vi.fn();
      EventBus.on(EventTypes.AUTH_RENEWAL_FAILED, failed);

      try {
        await expect(AuthService.getToken()).resolves.toBe(token);
        await vi.waitFor(() =>
          expect(failed).toHaveBeenCalledWith({
            reason: "invalid-response",
          }),
        );
        expect(post).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem("auth_token")).toBe(token);

        await expect(AuthService.getToken()).resolves.toBe(token);
        await flushPromises();
        expect(post).toHaveBeenCalledTimes(1);
      } finally {
        EventBus.off(EventTypes.AUTH_RENEWAL_FAILED, failed);
      }
    },
  );

  it("clears an expired session after a failed background renewal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:30:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 1, now - 3599);
    localStorage.setItem("auth_token", token);
    vi.spyOn(axios, "post").mockRejectedValue(new Error("network is down"));
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    try {
      await expect(AuthService.getToken()).resolves.toBe(token);
      await vi.advanceTimersByTimeAsync(0);

      vi.setSystemTime(Date.now() + 2_000);
      await vi.advanceTimersByTimeAsync(500);

      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(updated).toHaveBeenCalledTimes(1);
      await expect(AuthService.getToken()).resolves.toBeNull();
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, updated);
    }
  });

  it("returns null without requesting renewal when no token is stored", async () => {
    const post = vi.spyOn(axios, "post");

    await expect(AuthService.getToken()).resolves.toBeNull();
    await expect(AuthService.isAuthenticated()).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("works without localStorage during SSR", async () => {
    vi.stubGlobal("localStorage", undefined);
    const post = vi.spyOn(axios, "post");

    await expect(AuthService.getToken()).resolves.toBeNull();
    await expect(AuthService.isAuthenticated()).resolves.toBe(false);
    await expect(AuthService.getAuthHeader()).resolves.toEqual({});
    await expect(AuthService.saveToken("token")).resolves.toBeUndefined();
    await expect(AuthService.removeToken()).resolves.toBeUndefined();
    await expect(AuthService.removeToken("token")).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });
});
