import axios from "axios";
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

function tokenFromPayload(payload: Record<string, unknown>): string {
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

  it("renews a token near expiry before returning it", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3600);
    const renewedToken = tokenWithExpiry(
      now + 3600,
    );
    localStorage.setItem("auth_token", oldToken);
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, token: renewedToken },
    });
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      expect(await AuthService.getAuthHeader()).toEqual({
        headers: { Authorization: `Bearer ${renewedToken}` },
      });
      expect(localStorage.getItem("auth_token")).toBe(renewedToken);
      expect(post).toHaveBeenCalledWith(
        "/api/users/session/refresh",
        {},
        {
          headers: { Authorization: `Bearer ${oldToken}` },
          timeout: 10_000,
        },
      );
      expect(listener).toHaveBeenCalledTimes(1);
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

  it("uses the API base and checks the user initialization endpoint", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: { initialized: true },
    });

    expect(await Config.get()).toEqual({ SERVER_URL: "/api" });
    expect(await UserService.isInitialized()).toBe(true);
    expect(get).toHaveBeenCalledWith("/api/users/status/initialization");
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
    );
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

  it("resolves false on network and HTTP errors instead of rejecting", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("network is down"));
    await expect(UserService.isInitialized()).resolves.toBe(false);

    vi.spyOn(axios, "get").mockRejectedValue({
      isAxiosError: true,
      response: { status: 500 },
    });
    await expect(UserService.isInitialized()).resolves.toBe(false);
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

  it("returns the current token when renewal times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3601);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, code: "ECONNABORTED" });

    await expect(AuthService.getToken()).resolves.toBe(token);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      "/api/users/session/refresh",
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      },
    );
    expect(localStorage.getItem("auth_token")).toBe(token);
  });

  it("retries a network failure once, then pauses renewal for that token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:10:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3602);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue(new Error("network is down"));

    const first = AuthService.getToken();
    await vi.advanceTimersByTimeAsync(600);
    await expect(first).resolves.toBe(token);
    expect(post).toHaveBeenCalledTimes(2);

    await expect(AuthService.getToken()).resolves.toBe(token);
    expect(post).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 30_001);
    const later = AuthService.getToken();
    await vi.advanceTimersByTimeAsync(600);
    await expect(later).resolves.toBe(token);
    expect(post).toHaveBeenCalledTimes(4);
  });

  it("retries a 5xx renewal failure once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:20:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3603);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, response: { status: 503 } });

    const renewal = AuthService.getToken();
    await vi.advanceTimersByTimeAsync(600);
    await expect(renewal).resolves.toBe(token);
    expect(post).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("auth_token")).toBe(token);
  });

  it("clears the session when renewal is rejected with 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = tokenWithExpiry(now + 100, now - 3604);
    localStorage.setItem("auth_token", token);
    const post = vi
      .spyOn(axios, "post")
      .mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    const listener = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, listener);

    try {
      await expect(AuthService.getToken()).resolves.toBeNull();
      expect(post).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
      expect(localStorage.getItem("AUTH_TOKEN_KEY")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      EventBus.off(EventTypes.AUTH_UPDATED, listener);
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
      await expect(AuthService.getToken()).resolves.toBeNull();
      expect(post).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("auth_token")).toBeNull();
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

    const first = AuthService.getToken();
    const second = AuthService.getToken();
    await Promise.resolve();
    pending.resolve({ data: { token: renewedToken } });

    await expect(first).resolves.toBe(renewedToken);
    await expect(second).resolves.toBe(renewedToken);
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

    const renewal = AuthService.getToken();
    await Promise.resolve();
    await AuthService.saveToken(newerToken);
    pending.resolve({ data: { token: renewedToken } });

    await expect(renewal).resolves.toBe(newerToken);
    expect(localStorage.getItem("auth_token")).toBe(newerToken);
  });

  it("does not clear a re-established session on a stale 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 100, now - 3608);
    const newerToken = tokenWithExpiry(now + 7200, now + 1);
    localStorage.setItem("auth_token", oldToken);
    const pending = deferred<{ data: { token: string } }>();
    vi.spyOn(axios, "post").mockReturnValue(pending.promise);

    const renewal = AuthService.getToken();
    await Promise.resolve();
    await AuthService.saveToken(newerToken);
    pending.reject({ isAxiosError: true, response: { status: 401 } });

    await expect(renewal).resolves.toBe(newerToken);
    expect(localStorage.getItem("auth_token")).toBe(newerToken);
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
    "returns the current token without retrying when renewal returns $label",
    async ({ data, offset }) => {
      const now = Math.floor(Date.now() / 1000);
      const token = tokenWithExpiry(now + 100, now - 3600 - offset);
      localStorage.setItem("auth_token", token);
      const post = vi.spyOn(axios, "post").mockResolvedValue({ data });

      await expect(AuthService.getToken()).resolves.toBe(token);
      expect(post).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("auth_token")).toBe(token);

      await expect(AuthService.getToken()).resolves.toBe(token);
      expect(post).toHaveBeenCalledTimes(1);
    },
  );

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
    expect(post).not.toHaveBeenCalled();
  });
});
