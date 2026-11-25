import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import Config from "@devopsplaybook.io/common-web/services/Config";
import {
  LoginCodeError,
  LoginCodeService,
  createLoginCodeService,
  toLoginCodeError,
  type LoginCodeHttpClient,
  type LoginCodeHttpConfig,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

const SERVER_TIME = "2026-11-25T12:00:00.000Z";

const CAPABILITIES = {
  enabled: true,
  available: true,
  codeLength: 8,
  rotationSeconds: 30,
  graceSeconds: 60,
  ttlSeconds: 300,
  pollIntervalMs: 2000,
  approveRequiresPassword: false,
  serverTime: SERVER_TIME,
};

const CREATED = {
  requestToken: "request-token",
  code: "BCDFGHJK",
  codeExpiresAt: "2026-11-25T12:00:30.000Z",
  expiresAt: "2026-11-25T12:05:00.000Z",
  serverTime: SERVER_TIME,
};

interface HttpCall {
  method: "get" | "post";
  url: string;
  body?: unknown;
  config?: LoginCodeHttpConfig;
}

function recordingHttp(respond: (call: HttpCall) => unknown = () => ({})): {
  http: LoginCodeHttpClient;
  calls: HttpCall[];
} {
  const calls: HttpCall[] = [];
  const run = (call: HttpCall): { data: unknown } => {
    calls.push(call);
    return { data: respond(call) };
  };
  return {
    calls,
    http: {
      get: async (url: string, config?: LoginCodeHttpConfig) =>
        run({ method: "get", url, config }),
      post: async (url: string, body: unknown, config?: LoginCodeHttpConfig) =>
        run({ method: "post", url, body, config }),
    } as unknown as LoginCodeHttpClient,
  };
}

function httpError(
  status: number,
  body: unknown = { error: "nope", serverTime: SERVER_TIME },
): Error & { response: { status: number; data: unknown } } {
  return Object.assign(new Error("request failed"), {
    response: { status, data: body },
  });
}

function abortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

afterEach(() => {
  Config.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LoginCodeService base URL", () => {
  it("defaults to Config.SERVER_URL plus the login-code prefix", async () => {
    const { http, calls } = recordingHttp(() => CAPABILITIES);
    const service = new LoginCodeService({ http });

    await expect(service.capabilities()).resolves.toEqual(CAPABILITIES);

    expect(calls[0]).toEqual({
      method: "get",
      url: "/api/users/login-codes/capabilities",
      config: { signal: undefined, timeout: 10_000 },
    });
  });

  it("uses a configured server URL and trims its trailing slashes", async () => {
    Config.set({ SERVER_URL: "https://api.example.com/" });
    const { http, calls } = recordingHttp(() => CAPABILITIES);

    await new LoginCodeService({ http }).capabilities();

    expect(calls[0]?.url).toBe(
      "https://api.example.com/users/login-codes/capabilities",
    );
  });

  it("prefers a supplied absolute baseUrl and trims it", async () => {
    const { http, calls } = recordingHttp(() => CREATED);
    const service = new LoginCodeService({
      http,
      baseUrl: "  https://api.example.com/login-codes/// ",
    });

    await service.create();

    expect(calls[0]?.url).toBe("https://api.example.com/login-codes/");
  });

  it("caches the resolved prefix between calls", async () => {
    const { http, calls } = recordingHttp(() => CREATED);
    const service = new LoginCodeService({ http, baseUrl: "/custom" });

    await service.create();
    await service.create();

    expect(calls.map((call) => call.url)).toEqual([
      "/custom/",
      "/custom/",
    ]);
  });

  it("posts the create request to the prefix with a trailing slash", async () => {
    const { http, calls } = recordingHttp(() => CREATED);
    const service = new LoginCodeService({ http, baseUrl: "/api/login-codes" });

    await expect(service.create()).resolves.toEqual(CREATED);

    expect(calls[0]).toMatchObject({
      method: "post",
      url: "/api/login-codes/",
      body: undefined,
    });
  });
});

describe("LoginCodeService requests", () => {
  it("builds the poll bodies with and without refreshCode", async () => {
    const { http, calls } = recordingHttp(() => ({
      status: "pending",
      codeExpiresAt: "2026-11-25T12:00:30.000Z",
      expiresAt: "2026-11-25T12:05:00.000Z",
      serverTime: SERVER_TIME,
    }));
    const service = new LoginCodeService({ http, baseUrl: "/lc" });

    await service.poll("token-1");
    await service.poll("token-1", { refreshCode: true });
    await service.poll("token-1", { refreshCode: false });

    expect(calls[0]).toMatchObject({
      method: "post",
      url: "/lc/poll",
      body: { requestToken: "token-1" },
    });
    expect(calls[1]?.body).toEqual({
      requestToken: "token-1",
      refreshCode: true,
    });
    expect(calls[2]?.body).toEqual({ requestToken: "token-1" });
  });

  it("previews, approves and cancels with the documented bodies", async () => {
    const { http, calls } = recordingHttp(() => ({}));
    const service = new LoginCodeService({
      http,
      baseUrl: "/lc",
      getAuthHeader: () => ({ Authorization: "Bearer session" }),
    });

    await service.preview("BCDFGHJK");
    await service.approve({ code: "BCDFGHJK" });
    await service.approve({ code: "BCDFGHJK", password: "secret" });
    await service.approve({ code: "BCDFGHJK", password: "" });
    await service.cancel("token-1");

    expect(calls.map((call) => [call.url, call.body])).toEqual([
      ["/lc/preview", { code: "BCDFGHJK" }],
      ["/lc/approve", { code: "BCDFGHJK" }],
      ["/lc/approve", { code: "BCDFGHJK", password: "secret" }],
      ["/lc/approve", { code: "BCDFGHJK" }],
      ["/lc/cancel", { requestToken: "token-1" }],
    ]);
  });

  it("forwards the injected signal, timeout and headers", async () => {
    const { http, calls } = recordingHttp(() => ({}));
    const service = new LoginCodeService({
      http,
      baseUrl: "/lc",
      timeoutMs: 500,
      getAuthHeader: () => ({ Authorization: "Bearer session" }),
    });
    const controller = new AbortController();

    await service.preview("BCDFGHJK", { signal: controller.signal });

    expect(calls[0]?.config).toEqual({
      signal: controller.signal,
      timeout: 500,
      headers: { Authorization: "Bearer session" },
    });
  });

  it("accepts the AuthService { headers } shape", async () => {
    const { http, calls } = recordingHttp(() => ({}));
    const service = new LoginCodeService({
      http,
      baseUrl: "/lc",
      getAuthHeader: async () => ({
        headers: { Authorization: "Bearer wrapped" },
      }),
    });

    await service.approve({ code: "BCDFGHJK" });

    expect(calls[0]?.config?.headers).toEqual({
      Authorization: "Bearer wrapped",
    });
  });

  it("sends no header when the provider is absent or empty", async () => {
    const { http, calls } = recordingHttp(() => ({}));

    await new LoginCodeService({ http, baseUrl: "/lc" }).preview("BCDFGHJK");
    await new LoginCodeService({
      http,
      baseUrl: "/lc",
      getAuthHeader: () => undefined,
    }).preview("BCDFGHJK");

    expect(calls[0]?.config?.headers).toBeUndefined();
    expect(calls[1]?.config?.headers).toBeUndefined();
  });

  it("maps a rejecting auth provider to UNAUTHENTICATED", async () => {
    const { http, calls } = recordingHttp(() => ({}));
    const service = new LoginCodeService({
      http,
      baseUrl: "/lc",
      getAuthHeader: async () => {
        throw new Error("no session");
      },
    });

    await expect(service.preview("BCDFGHJK")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      retryable: false,
    });
    expect(calls).toHaveLength(0);
  });

  it("uses the default axios client and the factory", async () => {
    const get = vi
      .spyOn(axios, "get")
      .mockResolvedValue({ data: CAPABILITIES } as never);
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} } as never);

    const service = createLoginCodeService({ baseUrl: "/lc" });
    expect(service).toBeInstanceOf(LoginCodeService);

    await service.capabilities();
    await service.cancel("token-1");

    expect(get).toHaveBeenCalledWith("/lc/capabilities", {
      signal: undefined,
      timeout: 10_000,
    });
    expect(post).toHaveBeenCalledWith("/lc/cancel", {
      requestToken: "token-1",
    }, {
      signal: undefined,
      timeout: 10_000,
    });
  });

  it("falls back to the default timeout for invalid values", async () => {
    const { http, calls } = recordingHttp(() => ({}));

    await new LoginCodeService({ http, baseUrl: "/lc", timeoutMs: 0 }).cancel("t");
    await new LoginCodeService({
      http,
      baseUrl: "/lc",
      timeoutMs: Number.NaN,
    }).cancel("t");

    expect(calls[0]?.config?.timeout).toBe(10_000);
    expect(calls[1]?.config?.timeout).toBe(10_000);
  });
});

describe("LoginCodeService responses", () => {
  it("returns pending results with and without a rotated code", async () => {
    const pending = {
      status: "pending",
      code: "BCDFGHJK",
      codeExpiresAt: "2026-11-25T12:00:30.000Z",
      expiresAt: "2026-11-25T12:05:00.000Z",
      serverTime: SERVER_TIME,
    };
    const { http } = recordingHttp(() => pending);
    const service = new LoginCodeService({ http, baseUrl: "/lc" });

    await expect(service.poll("t")).resolves.toEqual(pending);

    const { http: httpWithoutCode } = recordingHttp(() => ({
      status: "pending",
      codeExpiresAt: pending.codeExpiresAt,
      expiresAt: pending.expiresAt,
      serverTime: SERVER_TIME,
    }));
    await expect(
      new LoginCodeService({ http: httpWithoutCode, baseUrl: "/lc" }).poll("t"),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("returns approved results and awaits onSession", async () => {
    const onSession = vi.fn(async () => {});
    const approved = {
      status: "approved",
      token: "jwt",
      user: { id: "u1" },
      expiresAt: "2026-11-25T18:00:00.000Z",
      serverTime: SERVER_TIME,
    };
    const { http } = recordingHttp(() => approved);
    const service = new LoginCodeService({ http, baseUrl: "/lc", onSession });

    await expect(service.poll("t")).resolves.toEqual(approved);
    expect(onSession).toHaveBeenCalledWith("jwt", { id: "u1" });
  });

  it("ignores an onSession rejection after a successful redemption", async () => {
    const onSession = vi.fn(async () => {
      throw new Error("storage blocked");
    });
    const approved = {
      status: "approved",
      token: "jwt",
      user: null,
      expiresAt: "2026-11-25T18:00:00.000Z",
      serverTime: SERVER_TIME,
    };
    const { http } = recordingHttp(() => approved);

    await expect(
      new LoginCodeService({ http, baseUrl: "/lc", onSession }).poll("t"),
    ).resolves.toMatchObject({ status: "approved" });
  });

  it("returns expired, cancelled and failed poll statuses", async () => {
    for (const status of ["expired", "cancelled", "failed"] as const) {
      const { http } = recordingHttp(() => ({ status, serverTime: SERVER_TIME }));
      await expect(
        new LoginCodeService({ http, baseUrl: "/lc" }).poll("t"),
      ).resolves.toMatchObject({ status });
    }
  });

  it("rejects malformed response bodies with INVALID_RESPONSE", async () => {
    const cases: Array<(service: LoginCodeService) => Promise<unknown>> = [
      (service) => service.capabilities(),
      (service) => service.create(),
      (service) => service.poll("t"),
      (service) => service.preview("BCDFGHJK"),
      (service) => service.approve({ code: "BCDFGHJK" }),
      (service) => service.cancel("t"),
    ];

    for (const run of cases) {
      const { http } = recordingHttp(() => null);
      await expect(run(new LoginCodeService({ http, baseUrl: "/lc" }))).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    }
  });

  it("validates the create payload fields", async () => {
    const invalid = [
      { ...CREATED, requestToken: 1 },
      { ...CREATED, code: undefined },
      { ...CREATED, codeExpiresAt: null },
      { ...CREATED, expiresAt: 12 },
    ];

    for (const response of invalid) {
      const { http } = recordingHttp(() => response);
      await expect(
        new LoginCodeService({ http, baseUrl: "/lc" }).create(),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("requires a known poll status and an approved token", async () => {
    const { http: unknownStatus } = recordingHttp(() => ({ status: "weird" }));
    await expect(
      new LoginCodeService({ http: unknownStatus, baseUrl: "/lc" }).poll("t"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const { http: missingToken } = recordingHttp(() => ({
      status: "approved",
      user: null,
      serverTime: SERVER_TIME,
    }));
    await expect(
      new LoginCodeService({ http: missingToken, baseUrl: "/lc" }).poll("t"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("LoginCodeService error mapping", () => {
  it("maps stable server codes and keeps statuses", async () => {
    const { http } = recordingHttp(() => {
      throw httpError(400, { code: "INVALID_CODE", error: "bad" });
    });

    await expect(
      new LoginCodeService({ http, baseUrl: "/lc" }).preview("BCDFGHJK"),
    ).rejects.toMatchObject({
      name: "LoginCodeError",
      code: "INVALID_CODE",
      status: 400,
      retryable: false,
    });
  });

  it("marks RATE_LIMITED retryable", async () => {
    const { http } = recordingHttp(() => {
      throw httpError(429, { code: "RATE_LIMITED" });
    });

    await expect(
      new LoginCodeService({ http, baseUrl: "/lc" }).create(),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it("maps bare 401 and 403 answers", async () => {
    const { http: unauth } = recordingHttp(() => {
      throw httpError(401, { error: "no session" });
    });
    await expect(
      new LoginCodeService({ http: unauth, baseUrl: "/lc" }).preview("BCDFGHJK"),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", retryable: false });

    const { http: forbidden } = recordingHttp(() => {
      throw httpError(403, { error: "forbidden" });
    });
    await expect(
      new LoginCodeService({ http: forbidden, baseUrl: "/lc" }).preview("BCDFGHJK"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps other HTTP statuses, retrying only 5xx", async () => {
    const { http: notFound } = recordingHttp(() => {
      throw httpError(404, {});
    });
    await expect(
      new LoginCodeService({ http: notFound, baseUrl: "/lc" }).create(),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 404,
      retryable: false,
    });

    const { http: unavailable } = recordingHttp(() => {
      throw httpError(503, {});
    });
    await expect(
      new LoginCodeService({ http: unavailable, baseUrl: "/lc" }).create(),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 503,
      retryable: true,
    });
  });

  it("maps timeouts, cancellations and network failures", () => {
    const timeout = Object.assign(new Error("timeout"), {
      code: "ECONNABORTED",
    });
    expect(toLoginCodeError(timeout)).toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    });

    const etimedout = Object.assign(new Error("timeout"), {
      code: "ETIMEDOUT",
    });
    expect(toLoginCodeError(etimedout).code).toBe("TIMEOUT");

    const canceled = Object.assign(new Error("canceled"), {
      code: "ERR_CANCELED",
    });
    expect(toLoginCodeError(canceled)).toMatchObject({
      code: "ABORTED",
      retryable: false,
    });

    const named = Object.assign(new Error("canceled"), {
      name: "CanceledError",
    });
    expect(toLoginCodeError(named).code).toBe("ABORTED");

    expect(toLoginCodeError(abortError()).code).toBe("ABORTED");

    expect(toLoginCodeError(new Error("offline"))).toMatchObject({
      code: "NETWORK",
      retryable: true,
    });

    const original = new LoginCodeError("FAILED");
    expect(toLoginCodeError(original)).toBe(original);
  });

  it("treats an unknown body code as an HTTP error", () => {
    const error = httpError(400, { code: "SOMETHING_ELSE" });
    expect(toLoginCodeError(error)).toMatchObject({
      code: "HTTP_ERROR",
      status: 400,
    });
  });
});

describe("LoginCodeService abort handling", () => {
  it("surfaces ABORTED for a pre-aborted signal", async () => {
    const http = {
      get: async (_url: string, config?: LoginCodeHttpConfig) => {
        if (config?.signal?.aborted) throw abortError();
        return { data: CAPABILITIES };
      },
      post: async () => ({ data: {} }),
    } as unknown as LoginCodeHttpClient;
    const controller = new AbortController();
    controller.abort();

    await expect(
      new LoginCodeService({ http, baseUrl: "/lc" }).capabilities({
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("surfaces ABORTED when a request is cancelled mid-flight", async () => {
    const http = {
      get: (_url: string, config?: LoginCodeHttpConfig) =>
        new Promise((_resolve, reject) => {
          if (config?.signal?.aborted) {
            reject(abortError());
            return;
          }
          config?.signal?.addEventListener("abort", () => reject(abortError()));
        }),
      post: async () => ({ data: {} }),
    } as unknown as LoginCodeHttpClient;
    const controller = new AbortController();
    const promise = new LoginCodeService({ http, baseUrl: "/lc" }).capabilities({
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
  });
});
