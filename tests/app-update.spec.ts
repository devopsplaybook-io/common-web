import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILD_MANIFEST_URL,
  BUILD_PROBE_TIMEOUT_MS,
  SHELL_FALLBACK_URL,
  createBuildVersionProbe,
  parseBuildManifest,
  parseShellBuildId,
} from "@devopsplaybook.io/common-web/services/BuildVersionProbe";
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  AppUpdateService,
} from "@devopsplaybook.io/common-web/services/AppUpdateService";
import {
  DEFAULT_SKIP_WAITING_MESSAGE,
  SW_UPDATE_TIMEOUT_MS,
  acceptServiceWorkerUpdate,
} from "@devopsplaybook.io/common-web/services/ServiceWorkerUpdate";
import {
  useAppUpdate,
  type UseAppUpdate,
  type UseAppUpdateOptions,
} from "@devopsplaybook.io/common-web/composables/useAppUpdate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle(turns = 30): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
  await nextTick();
}

function response(body: string, ok = true): Response {
  return {
    ok,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setOnline(true);
});

describe("BuildVersionProbe parsers", () => {
  it("parses the build manifest id", () => {
    expect(parseBuildManifest('{"id":"abc123"}')).toBe("abc123");
    expect(parseBuildManifest('{ "id" : "  spaced  " }')).toBe("spaced");
  });

  it("rejects invalid manifests", () => {
    expect(parseBuildManifest("not json")).toBeNull();
    expect(parseBuildManifest("null")).toBeNull();
    expect(parseBuildManifest("[]")).toBeNull();
    expect(parseBuildManifest('{"id":42}')).toBeNull();
    expect(parseBuildManifest('{"other":"x"}')).toBeNull();
    expect(parseBuildManifest('{"id":""}')).toBeNull();
    expect(parseBuildManifest('{"id":"   "}')).toBeNull();
  });

  it("parses every supported shell shape", () => {
    expect(
      parseShellBuildId('<script>window.__NUXT__={buildId:"one"}</script>'),
    ).toBe("one");
    expect(parseShellBuildId('<script>{"buildId": "two"}</script>')).toBe("two");
    expect(parseShellBuildId("<script>{'buildId': 'three'}</script>")).toBe(
      "three",
    );
  });

  it("returns null when the shell has no usable build id", () => {
    expect(parseShellBuildId("<html></html>")).toBeNull();
    expect(parseShellBuildId('<script>buildId:"   "</script>')).toBeNull();
  });
});

describe("createBuildVersionProbe", () => {
  it("reads the manifest with no-store and does not touch the shell", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('{"id":"build-1"}'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe("build-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(BUILD_MANIFEST_URL);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
  });

  it("falls back to the shell when the manifest is not ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("", false))
      .mockResolvedValueOnce(response('<html>buildId:"shell-1"</html>'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe("shell-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe(SHELL_FALLBACK_URL);
  });

  it("falls back when the manifest body is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("not json"))
      .mockResolvedValueOnce(response('<html>buildId:"shell-2"</html>'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe("shell-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back when the manifest request throws", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(response('<html>buildId:"shell-3"</html>'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe("shell-3");
  });

  it("returns null when both the manifest and the shell fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("", false))
      .mockResolvedValueOnce(response("", false));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBeNull();
  });

  it("honours custom URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('{"id":"custom"}'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
      manifestUrl: "/custom/latest.json",
      fallbackShellUrl: "/custom/index.html",
    });

    await expect(probe()).resolves.toBe("custom");
    expect(fetchMock.mock.calls[0]![0]).toBe("/custom/latest.json");
  });

  it("returns null without a fetch implementation", async () => {
    vi.stubGlobal("fetch", undefined);
    const probe = createBuildVersionProbe();
    await expect(probe()).resolves.toBeNull();
  });

  it("aborts and falls back after the timeout", async () => {
    vi.useFakeTimers();
    const abortAware = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const probe = createBuildVersionProbe({
      fetchImpl: abortAware as unknown as typeof fetch,
      timeoutMs: 50,
    });

    const pending = probe();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toBeNull();
    expect(abortAware).toHaveBeenCalledTimes(2);
  });

  it("sanitizes an invalid timeout to the default", async () => {
    vi.useFakeTimers();
    const abortAware = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const probe = createBuildVersionProbe({
      fetchImpl: abortAware as unknown as typeof fetch,
      timeoutMs: Number.NaN,
    });

    const pending = probe();
    await vi.advanceTimersByTimeAsync(BUILD_PROBE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(BUILD_PROBE_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
  });

  it("works without AbortController", async () => {
    vi.stubGlobal("AbortController", undefined);
    const fetchMock = vi.fn().mockResolvedValue(response('{"id":"no-abort"}'));
    const probe = createBuildVersionProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe("no-abort");
    expect(fetchMock.mock.calls[0]![1]!.signal).toBeUndefined();
  });
});

describe("AppUpdateService", () => {
  it("checks immediately on start and polls on the default interval", async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
    });

    const stop = service.start();
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(service.updateAvailable).toBe(true);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    stop();
  });

  it("uses a custom interval and pauses polling while hidden", async () => {
    vi.useFakeTimers();
    let hidden = false;
    const fetchLatest = vi.fn().mockResolvedValue("build-1");
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      intervalMs: 1000,
      isDocumentHidden: () => hidden,
    });

    const stop = service.start();
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    hidden = true;
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    hidden = false;
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    // A manual check still runs while hidden.
    hidden = true;
    await service.checkNow();
    expect(fetchLatest).toHaveBeenCalledTimes(3);

    stop();
  });

  it("falls back to the default interval for invalid values", async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn().mockResolvedValue("build-1");
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      intervalMs: 0,
    });

    const stop = service.start();
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    // An invalid interval must not become a 1 ms poll.
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    stop();
  });

  it("is idempotent and stops polling safely twice", async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      intervalMs: 1000,
    });

    const first = service.start();
    const second = service.start();
    expect(second).toBe(first);
    await settle();
    expect(service.updateAvailable).toBe(true);

    second();
    first();
    expect(service.updateAvailable).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });

  it("skips checks without a current build id or while offline", async () => {
    const fetchLatest = vi.fn().mockResolvedValue("build-2");

    for (const currentBuildId of [null, "", "   ", undefined]) {
      const service = new AppUpdateService({
        currentBuildId,
        fetchLatestBuildId: fetchLatest,
      });
      await service.checkNow();
    }
    expect(fetchLatest).not.toHaveBeenCalled();

    const online = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
    });
    setOnline(false);
    await online.checkNow();
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("shares a single in-flight request", async () => {
    const pending = deferred<string | null>();
    const fetchLatest = vi.fn().mockReturnValue(pending.promise);
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
    });

    const first = service.checkNow();
    const second = service.checkNow();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    pending.resolve("build-2");
    await Promise.all([first, second]);
    expect(service.updateAvailable).toBe(true);
  });

  it("swallows fetch failures and blank results", async () => {
    const failing = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.reject(new Error("boom")),
    });
    await expect(failing.checkNow()).resolves.toBeUndefined();
    expect(failing.updateAvailable).toBe(false);

    const blank = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve("   "),
    });
    await blank.checkNow();
    expect(blank.updateAvailable).toBe(false);
    expect(blank.latestBuildId).toBeNull();
  });

  it("announces a new build once and clears when current again", async () => {
    const onUpdateAvailable = vi.fn();
    let latest = "build-2";
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve(latest),
      onUpdateAvailable,
    });

    await service.checkNow();
    expect(service.updateAvailable).toBe(true);
    expect(service.latestBuildId).toBe("build-2");
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(onUpdateAvailable).toHaveBeenCalledWith("build-2");

    await service.checkNow();
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);

    latest = "build-1";
    await service.checkNow();
    expect(service.updateAvailable).toBe(false);
  });

  it("suppresses a dismissed build until a newer one arrives", async () => {
    let latest = "build-2";
    const onUpdateAvailable = vi.fn();
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve(latest),
      onUpdateAvailable,
    });

    await service.checkNow();
    service.dismiss();
    expect(service.updateAvailable).toBe(false);

    await service.checkNow();
    expect(service.updateAvailable).toBe(false);
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);

    latest = "build-3";
    await service.checkNow();
    expect(service.updateAvailable).toBe(true);
    expect(onUpdateAvailable).toHaveBeenCalledTimes(2);
    expect(service.latestBuildId).toBe("build-3");
  });

  it("dismiss without a latest build is a no-op", () => {
    const service = new AppUpdateService({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve(null),
    });
    expect(() => service.dismiss()).not.toThrow();
    expect(service.updateAvailable).toBe(false);
  });
});

describe("useAppUpdate composable", () => {
  function mountProbe(
    options: UseAppUpdateOptions,
  ): { wrapper: VueWrapper; api: UseAppUpdate } {
    let api: UseAppUpdate | undefined;
    const Probe = defineComponent({
      setup() {
        api = useAppUpdate(options);
        return () => h("span", "probe");
      },
    });
    const wrapper = mount(Probe);
    return { wrapper, api: api! };
  }

  it("auto-starts and exposes a new build", async () => {
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
    });

    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(api.updateAvailable.value).toBe(true);
    expect(api.latestBuildId.value).toBe("build-2");
    wrapper.unmount();
  });

  it("does not start when autoStart is false", async () => {
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      autoStart: false,
    });

    await settle();
    expect(fetchLatest).not.toHaveBeenCalled();
    expect(api.updateAvailable.value).toBe(false);

    api.start();
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("checks on visible, online and focus, not while hidden", async () => {
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const { wrapper } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      autoStart: false,
    });
    await settle();
    expect(fetchLatest).not.toHaveBeenCalled();

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fetchLatest).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(3);

    wrapper.unmount();
  });

  it("pauses the interval while the document is hidden", async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const { wrapper } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      intervalMs: 1000,
    });

    await settle();
    // The immediate start check still runs even though the document is hidden.
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it("dismisses per build and re-raises for a newer build", async () => {
    let latest = "build-2";
    const fetchLatest = vi.fn(() => Promise.resolve(latest));
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      autoStart: false,
    });

    await api.checkNow();
    expect(api.updateAvailable.value).toBe(true);
    expect(api.dismissed.value).toBe(false);

    api.dismiss();
    expect(api.updateAvailable.value).toBe(false);
    expect(api.dismissed.value).toBe(true);

    await api.checkNow();
    expect(api.updateAvailable.value).toBe(false);

    latest = "build-3";
    await api.checkNow();
    expect(api.updateAvailable.value).toBe(true);
    expect(api.dismissed.value).toBe(false);

    wrapper.unmount();
  });

  it("awaits beforeReload and reloads exactly once", async () => {
    const order: string[] = [];
    const reload = vi.fn(() => order.push("reload"));
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve("build-2"),
      autoStart: false,
      reload,
      beforeReload: async () => {
        await Promise.resolve();
        order.push("flush");
      },
    });

    await Promise.all([api.reload(), api.reload()]);
    expect(order).toEqual(["flush", "reload"]);
    expect(reload).toHaveBeenCalledTimes(1);

    await api.reload();
    expect(reload).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("vetoes the reload when beforeReload throws", async () => {
    const reload = vi.fn();
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve("build-2"),
      autoStart: false,
      reload,
      beforeReload: () => Promise.reject(new Error("queue not flushed")),
    });

    await expect(api.reload()).resolves.toBeUndefined();
    expect(reload).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("uses window.location.reload by default", async () => {
    const reload = vi.fn();
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: () => Promise.resolve("build-2"),
      autoStart: false,
    });

    vi.stubGlobal("window", { location: { reload } });
    await api.reload();
    expect(reload).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("removes listeners and timers on unmount", async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn().mockResolvedValue("build-2");
    const { wrapper, api } = mountProbe({
      currentBuildId: "build-1",
      fetchLatestBuildId: fetchLatest,
      intervalMs: 1000,
    });
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    // stop() is safe after unmount.
    expect(() => api.stop()).not.toThrow();
  });
});

describe("acceptServiceWorkerUpdate", () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(
    navigator,
    "serviceWorker",
  );

  function installServiceWorker(container: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  }): void {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: container,
    });
  }

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    }
  });

  function fakeRegistration(waiting: {
    postMessage: ReturnType<typeof vi.fn>;
  } | null) {
    return { waiting } as unknown as ServiceWorkerRegistration;
  }

  it("reloads once when there is no waiting worker", async () => {
    const reload = vi.fn();
    await acceptServiceWorkerUpdate({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("posts SKIP_WAITING, waits for controllerchange, then reloads once", async () => {
    const listeners: Array<() => void> = [];
    const container = {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
    installServiceWorker(container);
    const postMessage = vi.fn();
    const reload = vi.fn();

    const pending = acceptServiceWorkerUpdate({
      registration: fakeRegistration({ postMessage }),
      reload,
    });
    await settle();

    expect(postMessage).toHaveBeenCalledWith(DEFAULT_SKIP_WAITING_MESSAGE);
    expect(reload).not.toHaveBeenCalled();

    listeners.forEach((listener) => listener());
    await pending;
    expect(reload).toHaveBeenCalledTimes(1);

    // A duplicate controllerchange must not reload again.
    listeners.forEach((listener) => listener());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.removeEventListener).toHaveBeenCalled();
  });

  it("reloads after the timeout when controllerchange never fires", async () => {
    vi.useFakeTimers();
    const container = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    installServiceWorker(container);
    const reload = vi.fn();

    const pending = acceptServiceWorkerUpdate({
      registration: fakeRegistration({ postMessage: vi.fn() }),
      reload,
    });
    await vi.advanceTimersByTimeAsync(SW_UPDATE_TIMEOUT_MS);
    await pending;

    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.removeEventListener).toHaveBeenCalled();
  });

  it("keeps a single reload when controllerchange wins the race", async () => {
    vi.useFakeTimers();
    const listeners: Array<() => void> = [];
    const container = {
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
    installServiceWorker(container);
    const reload = vi.fn();

    const pending = acceptServiceWorkerUpdate({
      registration: fakeRegistration({ postMessage: vi.fn() }),
      reload,
    });
    listeners.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(SW_UPDATE_TIMEOUT_MS);
    await pending;

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("uses a custom message", async () => {
    vi.useFakeTimers();
    const container = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    installServiceWorker(container);
    const postMessage = vi.fn();
    const reload = vi.fn();

    const pending = acceptServiceWorkerUpdate({
      registration: fakeRegistration({ postMessage }),
      message: { type: "ACTIVATE" },
      reload,
      timeoutMs: 0,
    });
    await vi.advanceTimersByTimeAsync(SW_UPDATE_TIMEOUT_MS);
    await pending;

    expect(postMessage).toHaveBeenCalledWith({ type: "ACTIVATE" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("falls back to a plain reload when postMessage throws", async () => {
    const container = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    installServiceWorker(container);
    const reload = vi.fn();

    await acceptServiceWorkerUpdate({
      registration: fakeRegistration({
        postMessage: vi.fn(() => {
          throw new Error("detached");
        }),
      }),
      reload,
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads the window by default", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });

    await acceptServiceWorkerUpdate({});
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
