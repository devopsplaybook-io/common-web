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
  const payload = btoa(
    JSON.stringify({ exp, iat }),
  );
  return `header.${payload}.signature`;
}

function okResponse(
  config: InternalAxiosRequestConfig,
): {
  data: Record<string, never>;
  status: number;
  statusText: string;
  headers: AxiosHeaders;
  config: InternalAxiosRequestConfig;
} {
  return {
    data: {},
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  };
}

function createRecordingInstance(
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

afterEach(() => {
  localStorage.clear();
  EventBus.all.clear();
  vi.restoreAllMocks();
});

describe("axios auth interceptors", () => {
  it("attaches the stored token to requests without an explicit header", async () => {
    const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
    await AuthService.saveToken(token);
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = createRecordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources");

    expect(seen).toBeDefined();
    expect(seen?.headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("leaves explicit Authorization headers untouched", async () => {
    const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
    await AuthService.saveToken(token);
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = createRecordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources", {
      headers: { Authorization: "Bearer custom" },
    });

    expect(seen?.headers.get("Authorization")).toBe("Bearer custom");
  });

  it("does not renew the stored token for requests with an explicit header", async () => {
    const now = Math.floor(Date.now() / 1000);
    await AuthService.saveToken(tokenWithExpiry(now + 100, now - 3600));
    const post = vi.spyOn(axios, "post");
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = createRecordingInstance((config) => {
      seen = config;
    });

    await instance.post("/api/users/session/refresh", {}, {
      headers: { Authorization: "Bearer custom" },
    });

    expect(post).not.toHaveBeenCalled();
    expect(seen?.headers.get("Authorization")).toBe("Bearer custom");
  });

  it("does not attach a header when no token is stored", async () => {
    let seen: InternalAxiosRequestConfig | undefined;
    const instance = createRecordingInstance((config) => {
      seen = config;
    });

    await instance.get("/api/resources");

    expect(seen).toBeDefined();
    expect(seen?.headers.get("Authorization")).toBeUndefined();
  });

  it("clears the token and emits AUTH_UPDATED on 401 responses", async () => {
    const token = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
    await AuthService.saveToken(token);
    const updated = vi.fn();
    EventBus.on(EventTypes.AUTH_UPDATED, updated);

    const instance = axios.create();
    registerAxiosAuthInterceptors(instance);
    instance.defaults.adapter = async (config) => {
      throw new AxiosError(
        "Request failed with status code 401",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        {
          data: {},
          status: 401,
          statusText: "Unauthorized",
          headers: new AxiosHeaders(),
          config,
        },
      );
    };

    await expect(instance.get("/api/resources")).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(updated).toHaveBeenCalled();
  });

  it("registers its interceptors once per instance", () => {
    const instance = axios.create();

    expect(registerAxiosAuthInterceptors(instance)).toBe(true);
    const requestHandlers =
      instance.interceptors.request.handlers?.length ?? 0;
    const responseHandlers =
      instance.interceptors.response.handlers?.length ?? 0;
    expect(requestHandlers).toBe(1);
    expect(responseHandlers).toBe(1);

    expect(registerAxiosAuthInterceptors(instance)).toBe(false);
    expect(instance.interceptors.request.handlers?.length ?? 0).toBe(
      requestHandlers,
    );
    expect(instance.interceptors.response.handlers?.length ?? 0).toBe(
      responseHandlers,
    );
  });
});
