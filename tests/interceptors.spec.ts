import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTypes } from "@devopsplaybook.io/common-web/composables/EventBus";
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import { registerAxiosAuthInterceptors } from "@devopsplaybook.io/common-web/services/AxiosAuthInterceptor";

function tokenWithExpiry(
  exp: number,
  iat = Math.floor(Date.now() / 1000),
): string {
  return `header.${btoa(JSON.stringify({ exp, iat }))}.signature`;
}

function validToken(): string {
  return tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
}

function okResponse(config: InternalAxiosRequestConfig) {
  return {
    data: {},
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  };
}

function recordingInstance(
  onRequest: (config: InternalAxiosRequestConfig) => void,
): AxiosInstance {
  const instance = axios.create();
  registerAxiosAuthInterceptors(instance);
  instance.defaults.adapter = async (config) => {
    onRequest(config);
    return okResponse(config);
  };
  return instance;
}

function failingInstance(status: number): AxiosInstance {
  const instance = axios.create();
  registerAxiosAuthInterceptors(instance);
  instance.defaults.adapter = async (config) => {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      "ERR_BAD_REQUEST",
      config,
      undefined,
      {
        data: {},
        status,
        statusText: "Error",
        headers: new AxiosHeaders(),
        config,
      },
    );
  };
  return instance;
}

function handlerCounts(instance: AxiosInstance): {
  request: number;
  response: number;
} {
  const interceptors = instance.interceptors as unknown as {
    request: { handlers?: unknown[] };
    response: { handlers?: unknown[] };
  };
  return {
    request: interceptors.request.handlers?.length ?? 0,
    response: interceptors.response.handlers?.length ?? 0,
  };
}

afterEach(() => {
  localStorage.clear();
  EventBus.all.clear();
  vi.restoreAllMocks();
});

describe("axios auth interceptors", () => {
  it("is opt-in: a fresh instance has no interceptors", () => {
    expect(handlerCounts(axios.create())).toEqual({ request: 0, response: 0 });
  });

  it("attaches the stored token when no Authorization header is set", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources");

    expect(seen?.headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("sends no Authorization header when no token is stored", async () => {
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources");

    expect(seen).toBeDefined();
    expect(seen?.headers.get("Authorization")).toBeUndefined();
  });

  it("preserves an explicit Authorization header without renewing", async () => {
    const now = Math.floor(Date.now() / 1000);
    await AuthService.saveToken(tokenWithExpiry(now + 100, now - 3600));
    const post = vi.spyOn(axios, "post");
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources", {
      headers: { Authorization: "Bearer custom" },
    });

    expect(seen?.headers.get("Authorization")).toBe("Bearer custom");
    expect(post).not.toHaveBeenCalled();
  });

  it("clears the token and emits once on a 401 from a protected endpoint", async () => {
    await AuthService.saveToken(validToken());
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(instance.get("/api/resources")).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/api/users/session",
    "/api/users/session/",
    "https://api.example.com/users/session?x=1",
  ])("keeps the session on a failed login to %s", async (url) => {
    const token = validToken();
    await AuthService.saveToken(token);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(instance.post(url, {})).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBe(token);
    expect(updated).not.toHaveBeenCalled();
  });

  it("clears the token on a 401 from the session refresh endpoint", async () => {
    await AuthService.saveToken(validToken());
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(
      instance.post("/api/users/session/refresh", {}),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("registers once per instance", () => {
    const instance = axios.create();

    expect(registerAxiosAuthInterceptors(instance)).toBe(true);
    expect(handlerCounts(instance)).toEqual({ request: 1, response: 1 });

    expect(registerAxiosAuthInterceptors(instance)).toBe(false);
    expect(handlerCounts(instance)).toEqual({ request: 1, response: 1 });
  });
});
