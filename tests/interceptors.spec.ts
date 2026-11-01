import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTypes } from "@devopsplaybook.io/common-web/composables/EventBus";
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import Config from "@devopsplaybook.io/common-web/services/Config";
import {
  registerAxiosAuthInterceptors,
  type AxiosAuthInterceptorOptions,
} from "@devopsplaybook.io/common-web/services/AxiosAuthInterceptor";

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
  options?: AxiosAuthInterceptorOptions,
): AxiosInstance {
  const instance = axios.create();
  registerAxiosAuthInterceptors(instance, options);
  instance.defaults.adapter = async (config) => {
    onRequest(config);
    return okResponse(config);
  };
  return instance;
}

function failingInstance(
  status: number,
  options?: AxiosAuthInterceptorOptions,
): AxiosInstance {
  const instance = axios.create();
  registerAxiosAuthInterceptors(instance, options);
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

function gatedFailingInstance(
  status: number,
): {
  instance: AxiosInstance;
  started: Promise<void>;
  release: () => void;
} {
  const instance = axios.create();
  registerAxiosAuthInterceptors(instance);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  instance.defaults.adapter = async (config) => {
    markStarted();
    await gate;
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
  return { instance, started, release };
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
  Config.reset();
  EventBus.all.clear();
  vi.restoreAllMocks();
});

describe("axios auth interceptors", () => {
  it("is opt-in: a fresh instance has no interceptors", () => {
    expect(handlerCounts(axios.create())).toEqual({ request: 0, response: 0 });
  });

  it("attaches the stored token to a relative request", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources");

    expect(seen?.headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("attaches the stored token to a same-origin absolute request", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get(`${window.location.origin}/api/resources`);

    expect(seen?.headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it.each([
    "https://third-party.example.com/collect",
    "//third-party.example.com/collect",
    "http:third-party.example.com/collect",
  ])("does not attach the token to %s", async (url) => {
    await AuthService.saveToken(validToken());
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get(url);

    expect(seen).toBeDefined();
    expect(seen?.headers.get("Authorization")).toBeUndefined();
  });

  it("attaches the token to an absolute SERVER_URL origin only", async () => {
    Config.set({ SERVER_URL: "https://api.example.com" });
    const token = validToken();
    await AuthService.saveToken(token);
    let first: InternalAxiosRequestConfig | undefined;
    let second: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      if (first === undefined) first = config;
      else second = config;
    });

    await instance.get("https://api.example.com/collect");
    await instance.get("https://other.example.com/collect");

    expect(first?.headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(second?.headers.get("Authorization")).toBeUndefined();
  });

  it("allows explicitly configured extra origins", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    let first: InternalAxiosRequestConfig | undefined;
    let second: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance(
      (config) => {
        if (first === undefined) first = config;
        else second = config;
      },
      { allowedOrigins: ["https://analytics.example.com"] },
    );

    await instance.get("https://analytics.example.com/collect");
    await instance.get("https://other.example.com/collect");

    expect(first?.headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(second?.headers.get("Authorization")).toBeUndefined();
  });

  it("rejects an invalid allowed origin and stays reusable", () => {
    const instance = axios.create();

    expect(() =>
      registerAxiosAuthInterceptors(instance, {
        allowedOrigins: ["not a url"],
      }),
    ).toThrow(TypeError);

    expect(registerAxiosAuthInterceptors(instance)).toBe(true);
    expect(registerAxiosAuthInterceptors(instance)).toBe(false);
    expect(handlerCounts(instance)).toEqual({ request: 1, response: 1 });
  });

  it("does not trigger renewal for a foreign-origin request", async () => {
    const now = Math.floor(Date.now() / 1000);
    await AuthService.saveToken(tokenWithExpiry(now + 100, now - 3600));
    const post = vi.spyOn(axios, "post");
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = recordingInstance((config) => {
      seen = config;
    });

    await instance.get("https://third-party.example.com/collect");

    expect(seen?.headers.get("Authorization")).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
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

  it("keeps a newer token when a stale 401 arrives", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = tokenWithExpiry(now + 3600, now - 1000);
    const newerToken = tokenWithExpiry(now + 7200, now);
    await AuthService.saveToken(oldToken);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const { instance, started, release } = gatedFailingInstance(401);
    const request = instance.get("/api/resources");
    await started;
    await AuthService.saveToken(newerToken);
    expect(updated).toHaveBeenCalledTimes(1);

    release();
    await expect(request).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBe(newerToken);
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("does not clear the session on a 401 from a request that sent no token", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(
      instance.get("https://third-party.example.com/collect"),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBe(token);
    expect(updated).not.toHaveBeenCalled();
  });

  it("does not clear the session on a 401 from a custom Authorization header", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(
      instance.get("/api/resources", {
        headers: { Authorization: "Bearer custom" },
      }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBe(token);
    expect(updated).not.toHaveBeenCalled();
  });

  it("clears the session on a matching explicit Bearer header", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = failingInstance(401);
    await expect(
      instance.get("/api/resources", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ).rejects.toBeInstanceOf(AxiosError);

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

  it("uses configured login paths instead of the default", async () => {
    const token = validToken();
    await AuthService.saveToken(token);
    const instance = failingInstance(401, {
      loginPaths: ["/auth/login"],
    });

    await expect(
      instance.post("/api/auth/login", {}),
    ).rejects.toBeInstanceOf(AxiosError);
    expect(localStorage.getItem("auth_token")).toBe(token);

    await expect(
      instance.post("/api/users/session", {}),
    ).rejects.toBeInstanceOf(AxiosError);
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("exempts no path when loginPaths is empty", async () => {
    await AuthService.saveToken(validToken());
    const instance = failingInstance(401, { loginPaths: [] });

    await expect(
      instance.post("/users/session", {}),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("registers once per instance", () => {
    const instance = axios.create();

    expect(registerAxiosAuthInterceptors(instance)).toBe(true);
    expect(handlerCounts(instance)).toEqual({ request: 1, response: 1 });

    expect(registerAxiosAuthInterceptors(instance)).toBe(false);
    expect(handlerCounts(instance)).toEqual({ request: 1, response: 1 });
  });
});
