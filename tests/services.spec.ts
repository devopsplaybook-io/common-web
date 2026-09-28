import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import Config from "@devopsplaybook.io/common-web/services/Config";
import { PreferencesService } from "@devopsplaybook.io/common-web/services/PreferencesService";
import { RefreshIntervalService } from "@devopsplaybook.io/common-web/services/RefreshIntervalService";
import { Timeout } from "@devopsplaybook.io/common-web/services/Timeout";
import { UserService } from "@devopsplaybook.io/common-web/services/UserService";

function tokenWithExpiry(
  exp: number,
  iat = Math.floor(Date.now() / 1000),
): string {
  const payload = btoa(
    JSON.stringify({ exp, iat }),
  );
  return `header.${payload}.signature`;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shared services", () => {
  it("reads legacy auth storage keys and migrates to auth_token", async () => {
    const token = tokenWithExpiry(Date.now() / 1000 + 3600);
    localStorage.setItem("AUTH_TOKEN", token);

    expect(await AuthService.getToken()).toBe(token);
    expect(localStorage.getItem("auth_token")).toBe(token);
    expect(localStorage.getItem("AUTH_TOKEN")).toBeNull();
    expect(await AuthService.getAuthHeader()).toEqual({
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  it("removes expired tokens and reports unauthenticated", async () => {
    localStorage.setItem("auth_token", tokenWithExpiry(1));

    expect(await AuthService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem("auth_token")).toBeNull();
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

    expect(await AuthService.getAuthHeader()).toEqual({
      headers: { Authorization: `Bearer ${renewedToken}` },
    });
    expect(localStorage.getItem("auth_token")).toBe(renewedToken);
    expect(post).toHaveBeenCalledWith(
      "/api/users/session/refresh",
      {},
      { headers: { Authorization: `Bearer ${oldToken}` } },
    );
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
