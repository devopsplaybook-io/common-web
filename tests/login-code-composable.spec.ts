import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOGIN_CODE_MAX_POLL_FAILURES,
  useLoginCode,
  type UseLoginCodeOptions,
  type UseLoginCodeResult,
} from "@devopsplaybook.io/common-web/composables/useLoginCode";
import {
  LoginCodeError,
  type LoginCodeCapabilities,
  type LoginCodeRequest,
  type LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

const SERVER_TIME = "2026-11-25T12:00:00.000Z";
const NOW = Date.parse(SERVER_TIME);

function capabilities(
  overrides: Partial<LoginCodeCapabilities> = {},
): LoginCodeCapabilities {
  return {
    enabled: true,
    available: true,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 2000,
    approveRequiresPassword: false,
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

function created(
  overrides: Partial<LoginCodeRequest> = {},
): LoginCodeRequest {
  return {
    requestToken: "request-token",
    code: "BCDFGHJK",
    codeExpiresAt: "2026-11-25T12:00:30.000Z",
    expiresAt: "2026-11-25T12:05:00.000Z",
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    status: "pending" as const,
    codeExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    serverTime: new Date(Date.now()).toISOString(),
    ...overrides,
  };
}

interface FakeService {
  capabilities: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  poll: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function makeService(
  overrides: Partial<FakeService> = {},
): FakeService {
  return {
    capabilities: vi.fn().mockResolvedValue(capabilities()),
    create: vi.fn().mockResolvedValue(created()),
    poll: vi.fn().mockReturnValue(new Promise(() => {})),
    cancel: vi.fn().mockResolvedValue({ status: "cancelled", serverTime: SERVER_TIME }),
    ...overrides,
  };
}

function asService(service: FakeService): LoginCodeService {
  return service as unknown as LoginCodeService;
}

async function settle(turns = 24): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

const wrappers: VueWrapper[] = [];

function mountUse(
  service: FakeService,
  options: Omit<UseLoginCodeOptions, "service"> = {},
): { wrapper: VueWrapper; api: UseLoginCodeResult } {
  let api!: UseLoginCodeResult;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useLoginCode({ service: asService(service), ...options });
        return () => h("div");
      },
    }),
  );
  wrappers.push(wrapper);
  return { wrapper, api };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useLoginCode capabilities", () => {
  it("loads capabilities on mount and stays idle", async () => {
    const service = makeService();
    const { api } = mountUse(service);

    expect(service.capabilities).toHaveBeenCalledTimes(1);
    expect(api.enabled.value).toBe(false);
    expect(api.available.value).toBe(false);

    await settle();

    expect(api.status.value).toBe("idle");
    expect(api.enabled.value).toBe(true);
    expect(api.available.value).toBe(true);
    expect(api.capabilities.value).toEqual(capabilities());
    expect(api.code.value).toBeNull();
    expect(api.formattedCode.value).toBeNull();
    expect(api.secondsUntilRefresh.value).toBeNull();
    expect(api.secondsUntilExpiry.value).toBeNull();
  });

  it("fails closed when the capability probe fails", async () => {
    const service = makeService({
      capabilities: vi.fn().mockRejectedValue(new Error("down")),
    });
    const { api } = mountUse(service);
    await settle();

    expect(api.enabled.value).toBe(false);
    expect(api.available.value).toBe(false);
    expect(api.capabilities.value).toBeNull();

    await api.start();
    await settle();

    expect(api.status.value).toBe("error");
    expect(api.error.value).toMatchObject({ code: "LOGIN_CODE_UNAVAILABLE" });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("retries the capability probe after a failure", async () => {
    const service = makeService({
      capabilities: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValue(capabilities()),
    });
    const { api } = mountUse(service);
    await settle();
    expect(api.available.value).toBe(false);

    await api.start();
    await settle();

    expect(service.capabilities).toHaveBeenCalledTimes(2);
    expect(api.status.value).toBe("waiting");
  });

  it("reports an error when the feature is disabled or unavailable", async () => {
    for (const probe of [
      capabilities({ enabled: false }),
      capabilities({ available: false }),
    ]) {
      const service = makeService({
        capabilities: vi.fn().mockResolvedValue(probe),
      });
      const { api } = mountUse(service);
      await settle();

      await api.start();
      await settle();

      expect(api.status.value).toBe("error");
      expect(api.error.value?.code).toBe("LOGIN_CODE_UNAVAILABLE");
      expect(service.create).not.toHaveBeenCalled();
      wrappers.pop()?.unmount();
    }
  });

  it("deduplicates concurrent capability loads", async () => {
    const service = makeService();
    const { api } = mountUse(service);

    const first = api.start();
    const second = api.start();
    await Promise.all([first, second]);
    await settle();

    expect(service.capabilities).toHaveBeenCalledTimes(1);
  });
});

describe("useLoginCode new-device flow", () => {
  it("creates a request and enters the waiting state", async () => {
    const service = makeService();
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("waiting");
    expect(api.code.value).toBe("BCDFGHJK");
    expect(api.formattedCode.value).toBe("BCDF-GHJK");
    expect(api.secondsUntilRefresh.value).toBe(30);
    expect(api.secondsUntilExpiry.value).toBe(300);
    expect(api.error.value).toBeNull();
  });

  it("counts down against the server clock, not the local clock", async () => {
    const offset = 30_000;
    const service = makeService({
      capabilities: vi
        .fn()
        .mockResolvedValue(capabilities({ serverTime: "2026-11-25T12:00:30.000Z" })),
      create: vi.fn().mockResolvedValue(
        created({
          serverTime: "2026-11-25T12:00:30.000Z",
          codeExpiresAt: "2026-11-25T12:01:00.000Z",
          expiresAt: "2026-11-25T12:06:00.000Z",
        }),
      ),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(api.secondsUntilRefresh.value).toBe(30);
    expect(api.secondsUntilExpiry.value).toBe(330);

    await vi.advanceTimersByTimeAsync(offset / 3);
    await settle();
    expect(api.secondsUntilRefresh.value).toBe(20);

    await vi.advanceTimersByTimeAsync(40_000);
    await settle();
    expect(api.secondsUntilRefresh.value).toBe(0);
    expect(api.secondsUntilExpiry.value).toBe(280);
  });

  it("keeps the previous offset when serverTime is malformed", async () => {
    const service = makeService({
      capabilities: vi
        .fn()
        .mockResolvedValue(capabilities({ serverTime: "2026-11-25T12:00:30.000Z" })),
      create: vi.fn().mockResolvedValue(
        created({
          serverTime: "not-a-date",
          codeExpiresAt: "2026-11-25T12:01:00.000Z",
        }),
      ),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(api.secondsUntilRefresh.value).toBe(30);
  });

  it("exposes no countdown when the deadlines are malformed", async () => {
    const service = makeService({
      create: vi.fn().mockResolvedValue(
        created({ codeExpiresAt: "nope", expiresAt: "also-nope" }),
      ),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(api.status.value).toBe("waiting");
    expect(api.secondsUntilRefresh.value).toBeNull();
    expect(api.secondsUntilExpiry.value).toBeNull();
  });

  it("maps a retryable create failure and retries from scratch", async () => {
    const service = makeService({
      create: vi
        .fn()
        .mockRejectedValueOnce(
          new LoginCodeError("RATE_LIMITED", undefined, { retryable: true }),
        )
        .mockResolvedValue(created()),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();
    expect(api.status.value).toBe("error");
    expect(api.error.value).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });

    await api.retry();
    await settle();
    expect(api.status.value).toBe("waiting");
    expect(api.error.value).toBeNull();
  });

  it("maps an unknown create failure to a retryable network error", async () => {
    const service = makeService({
      create: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(api.status.value).toBe("error");
    expect(api.error.value).toMatchObject({
      code: "NETWORK",
      retryable: true,
    });
  });

  it("ignores an aborted create", async () => {
    const service = makeService({
      create: vi.fn().mockRejectedValue(new LoginCodeError("ABORTED")),
    });
    const { api } = mountUse(service);
    await settle();

    await api.start();
    await settle();

    expect(api.status.value).toBe("creating");
    expect(api.error.value).toBeNull();
  });
});

describe("useLoginCode polling", () => {
  it("polls at the server-advertised interval", async () => {
    const service = makeService({
      capabilities: vi.fn().mockResolvedValue(capabilities({ pollIntervalMs: 500 })),
      poll: vi.fn().mockImplementation(async () => pending()),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(499);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(2);
    expect(service.poll).toHaveBeenCalledWith("request-token", {
      signal: expect.any(AbortSignal),
    });
  });

  it("falls back to the default interval for invalid advertised values", async () => {
    for (const pollIntervalMs of [0, Number.NaN]) {
      const service = makeService({
        capabilities: vi.fn().mockResolvedValue(capabilities({ pollIntervalMs })),
        poll: vi.fn().mockImplementation(async () => pending()),
      });
      const { api } = mountUse(service);
      await settle();
      await api.start();
      await settle();

      await vi.advanceTimersByTimeAsync(1999);
      await settle();
      expect(service.poll).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await settle();
      expect(service.poll).toHaveBeenCalledTimes(1);
      wrappers.pop()?.unmount();
    }
  });

  it("adopts a rotated code from a pending poll", async () => {
    const service = makeService({
      poll: vi.fn().mockImplementation(async () =>
        pending({
          code: "ZXCVBNMQ",
          codeExpiresAt: "2026-11-25T12:00:40.000Z",
          serverTime: SERVER_TIME,
        }),
      ),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();
    expect(api.formattedCode.value).toBe("BCDF-GHJK");

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(api.code.value).toBe("ZXCVBNMQ");
    expect(api.formattedCode.value).toBe("ZXCV-BNMQ");
    expect(api.secondsUntilRefresh.value).toBe(40);
  });

  it("stops polling and calls onSession once approved", async () => {
    const onSession = vi.fn(async () => {});
    const service = makeService({
      poll: vi.fn().mockResolvedValue({
        status: "approved",
        token: "jwt",
        user: { id: "u1" },
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
    });
    const { api } = mountUse(service, { onSession });
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(api.status.value).toBe("approved");
    expect(api.session.value).toEqual({ token: "jwt", user: { id: "u1" } });
    expect(api.user.value).toEqual({ id: "u1" });
    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession).toHaveBeenCalledWith("jwt", { id: "u1" });
    expect(api.secondsUntilRefresh.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(service.poll).toHaveBeenCalledTimes(1);
  });

  it("ignores an onSession rejection after approval", async () => {
    const service = makeService({
      poll: vi.fn().mockResolvedValue({
        status: "approved",
        token: "jwt",
        user: null,
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
    });
    const onSession = vi.fn(async () => {
      throw new Error("storage blocked");
    });
    const { api } = mountUse(service, { onSession });
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(api.status.value).toBe("approved");
    expect(onSession).toHaveBeenCalledTimes(1);
  });

  it("maps expired, cancelled and failed poll statuses", async () => {
    for (const status of ["expired", "cancelled", "failed"] as const) {
      const service = makeService({
        poll: vi.fn().mockResolvedValue({
          status,
          expiresAt: "2026-11-25T18:00:00.000Z",
          serverTime: SERVER_TIME,
        }),
      });
      const { api } = mountUse(service);
      await settle();
      await api.start();
      await settle();

      await vi.advanceTimersByTimeAsync(2000);
      await settle();

      if (status === "failed") {
        expect(api.status.value).toBe("error");
        expect(api.error.value?.code).toBe("FAILED");
      } else {
        expect(api.status.value).toBe(status);
      }
      expect(vi.getTimerCount()).toBe(0);
      wrappers.pop()?.unmount();
    }
  });

  it("backs off exponentially and recovers", async () => {
    const service = makeService({
      capabilities: vi.fn().mockResolvedValue(capabilities({ pollIntervalMs: 1000 })),
      poll: vi
        .fn()
        .mockRejectedValueOnce(
          new LoginCodeError("NETWORK", undefined, { retryable: true }),
        )
        .mockRejectedValueOnce(
          new LoginCodeError("NETWORK", undefined, { retryable: true }),
        )
        .mockImplementation(async () => pending()),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(4);
    expect(api.status.value).toBe("waiting");
  });

  it("gives up after the maximum number of consecutive failures", async () => {
    const service = makeService({
      capabilities: vi.fn().mockResolvedValue(capabilities({ pollIntervalMs: 1000 })),
      poll: vi
        .fn()
        .mockRejectedValue(
          new LoginCodeError("NETWORK", undefined, { retryable: true }),
        ),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(31_000);
    await settle();

    expect(service.poll).toHaveBeenCalledTimes(LOGIN_CODE_MAX_POLL_FAILURES);
    expect(api.status.value).toBe("error");
    expect(api.error.value?.code).toBe("NETWORK");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops immediately on a non-retryable failure", async () => {
    const service = makeService({
      poll: vi.fn().mockRejectedValue(new LoginCodeError("INVALID_CODE")),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(service.poll).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("error");
    expect(api.error.value?.code).toBe("INVALID_CODE");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores aborted polls and retries unknown failures", async () => {
    const aborted = makeService({
      poll: vi.fn().mockRejectedValue(new LoginCodeError("ABORTED")),
    });
    const first = mountUse(aborted);
    await settle();
    await first.api.start();
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(first.api.status.value).toBe("waiting");
    expect(first.api.error.value).toBeNull();
    wrappers.pop()?.unmount();

    const failing = makeService({
      poll: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const second = mountUse(failing);
    await settle();
    await second.api.start();
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(second.api.status.value).toBe("waiting");
    expect(failing.poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(failing.poll).toHaveBeenCalledTimes(2);
  });
});

describe("useLoginCode visibility and focus", () => {
  it("pauses while hidden and resumes immediately when visible", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const service = makeService();
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    expect(service.poll).not.toHaveBeenCalled();

    // Time passes while hidden: the local clock must be refreshed on resume.
    vi.setSystemTime(NOW + 10_000);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();

    expect(service.poll).toHaveBeenCalledTimes(1);
    expect(api.secondsUntilExpiry.value).toBe(290);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it("resumes on window focus only while the document is visible", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const service = makeService();
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    visibility.mockReturnValue("hidden");
    window.dispatchEvent(new Event("focus"));
    expect(service.poll).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(service.poll).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("waiting");
  });

  it("ignores visibility and focus events outside the waiting state", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const service = makeService();
    mountUse(service);
    await settle();

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    visibility.mockReturnValue("visible");
    window.dispatchEvent(new Event("focus"));

    expect(service.poll).not.toHaveBeenCalled();
  });
});

describe("useLoginCode cancel, retry and lifecycle", () => {
  it("cancels a waiting request and notifies the server once", async () => {
    const service = makeService();
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await api.cancel();
    await settle();

    expect(service.cancel).toHaveBeenCalledTimes(1);
    expect(service.cancel).toHaveBeenCalledWith("request-token");
    expect(api.status.value).toBe("cancelled");
    expect(vi.getTimerCount()).toBe(0);

    await api.cancel();
    expect(service.cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores a failing cancel request", async () => {
    const service = makeService({
      cancel: vi.fn().mockRejectedValue(new Error("gone")),
    });
    const { api } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await expect(api.cancel()).resolves.toBeUndefined();
    expect(api.status.value).toBe("cancelled");
  });

  it("cancels while the request is still being created", async () => {
    let createSignal: AbortSignal | undefined;
    const service = makeService({
      create: vi.fn().mockImplementation((options?: { signal?: AbortSignal }) => {
        createSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new LoginCodeError("ABORTED")),
          );
        });
      }),
    });
    const { api } = mountUse(service);
    await settle();

    const starting = api.start();
    await settle();
    expect(api.status.value).toBe("creating");

    await api.cancel();
    expect(api.status.value).toBe("cancelled");
    expect(service.cancel).not.toHaveBeenCalled();
    expect(createSignal?.aborted).toBe(true);
    await starting;
  });

  it("cancels an idle composable without a server call", async () => {
    const service = makeService();
    const { api } = mountUse(service);
    await settle();

    await api.cancel();

    expect(api.status.value).toBe("cancelled");
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it("lets a second start win over a stale create response", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    let call = 0;
    const service = makeService({
      create: vi.fn().mockImplementation((options?: { signal?: AbortSignal }) => {
        signals.push(options?.signal);
        call += 1;
        if (call === 1) return new Promise(() => {});
        return Promise.resolve(
          created({ requestToken: "second-token", code: "ZXCVBNMQ" }),
        );
      }),
    });
    const { api } = mountUse(service);
    await settle();

    void api.start();
    await settle();
    await api.start();
    await settle();

    expect(signals[0]?.aborted).toBe(true);
    expect(api.status.value).toBe("waiting");
    expect(api.code.value).toBe("ZXCVBNMQ");
    expect(service.capabilities).toHaveBeenCalledTimes(1);
  });

  it("clears timers, aborts requests and removes listeners on unmount", async () => {
    let pollSignal: AbortSignal | undefined;
    const service = makeService({
      poll: vi.fn().mockImplementation((_token: string, options?: { signal?: AbortSignal }) => {
        pollSignal = options?.signal;
        return new Promise(() => {});
      }),
    });
    const { api, wrapper } = mountUse(service);
    await settle();
    await api.start();
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(pollSignal?.aborted).toBe(false);

    wrapper.unmount();
    wrappers.pop();

    expect(pollSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
