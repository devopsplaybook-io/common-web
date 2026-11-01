import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { AxiosHeaders } from "axios";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTypes, handleError } from "@devopsplaybook.io/common-web/composables/EventBus";
import { useAppHeight } from "@devopsplaybook.io/common-web/composables/useAppHeight";
import { THEME_INIT_SCRIPT, THEME_KEY } from "@devopsplaybook.io/common-web/composables/theme";
import { useTheme } from "@devopsplaybook.io/common-web/composables/useTheme";
import {
  AUTH_TOKEN_KEY,
  AuthService,
} from "@devopsplaybook.io/common-web/services/AuthService";
import { AuthenticationStore } from "@devopsplaybook.io/common-web/stores/AuthenticationStore";

function tokenWithExpiry(
  exp: number,
  iat = Math.floor(Date.now() / 1000),
): string {
  return `header.${btoa(JSON.stringify({ exp, iat }))}.signature`;
}

function validToken(): string {
  return tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600);
}

interface FakeMediaQuery {
  matches: boolean;
  listeners: Array<(event: { matches: boolean }) => void>;
}

function stubMatchMedia(initialMatches: boolean): FakeMediaQuery {
  const media: FakeMediaQuery = {
    matches: initialMatches,
    listeners: [],
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: media.matches,
      addEventListener: (
        _type: string,
        listener: (event: { matches: boolean }) => void,
      ) => {
        media.listeners.push(listener);
      },
      removeEventListener: (
        _type: string,
        listener: (event: { matches: boolean }) => void,
      ) => {
        const index = media.listeners.indexOf(listener);
        if (index !== -1) media.listeners.splice(index, 1);
      },
    }),
  );
  return media;
}

function fireMediaChange(media: FakeMediaQuery, matches: boolean): void {
  media.matches = matches;
  for (const listener of media.listeners) listener({ matches });
}

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

function height(): string {
  return document.documentElement.style.getPropertyValue("--app-height");
}

function mountComposable<Returned>(setup: () => Returned): {
  result: Returned;
  wrapper: { unmount: () => void };
} {
  let result!: Returned;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
  );
  return { result, wrapper };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  EventBus.all.clear();
});

describe("composables and event utilities", () => {
  it("updates the app viewport height and removes its listeners", async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          useAppHeight();
          return () => h("div");
        },
      }),
    );
    await nextTick();

    expect(document.documentElement.style.getPropertyValue("--app-height")).toBe(
      `${window.innerHeight}px`,
    );

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--app-height"),
      ).toBe("720px");
    });
    wrapper.unmount();
  });

  it("shares one scheduled frame between app-height instances", async () => {
    const callbacks: FrameRequestCallback[] = [];
    let nextFrame = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        nextFrame += 1;
        return nextFrame;
      }),
    );
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);

    const first = mount(
      defineComponent({
        setup() {
          useAppHeight();
          return () => h("div");
        },
      }),
    );
    const second = mount(
      defineComponent({
        setup() {
          useAppHeight();
          return () => h("div");
        },
      }),
    );
    await nextTick();

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 700,
    });
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(callbacks).toHaveLength(1);

    first.unmount();
    expect(cancel).not.toHaveBeenCalled();

    callbacks[0]?.(0);
    expect(height()).toBe("700px");

    second.unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels a pending app-height frame only when the last instance unmounts", async () => {
    let nextFrame = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => {
        nextFrame += 1;
        return nextFrame;
      }),
    );
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);

    const wrapper = mount(
      defineComponent({
        setup() {
          useAppHeight();
          return () => h("div");
        },
      }),
    );
    await nextTick();

    window.dispatchEvent(new Event("resize"));
    expect(nextFrame).toBe(1);

    wrapper.unmount();
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it("updates the app height immediately without requestAnimationFrame", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);

    const wrapper = mount(
      defineComponent({
        setup() {
          useAppHeight();
          return () => h("div");
        },
      }),
    );
    await nextTick();

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
    });
    window.dispatchEvent(new Event("resize"));

    expect(height()).toBe("640px");
    wrapper.unmount();
  });

  it("applies and persists an explicit theme preference", async () => {
    const { result: theme, wrapper } = mountComposable(() => useTheme());

    await nextTick();
    theme.setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("UI_THEME")).toBe("dark");
    theme.setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    wrapper.unmount();
  });

  it("is dark under system preference when the OS scheme is dark", async () => {
    const media = stubMatchMedia(true);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    theme.toggleTheme();
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("is light under system preference when the OS scheme is light", async () => {
    const media = stubMatchMedia(false);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    theme.toggleTheme();
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("follows media changes under system preference but honours explicit overrides", async () => {
    const media = stubMatchMedia(false);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(theme.isDark.value).toBe(false);
    fireMediaChange(media, true);
    await nextTick();
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    theme.setTheme("dark");
    fireMediaChange(media, false);
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    theme.setTheme("system");
    fireMediaChange(media, false);
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("honours a stored preference on mount over the OS scheme", async () => {
    const media = stubMatchMedia(false);
    localStorage.setItem(THEME_KEY, "dark");
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("applies the theme when localStorage is undefined", async () => {
    vi.stubGlobal("localStorage", undefined);
    stubMatchMedia(false);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(() => theme.setTheme("dark")).not.toThrow();
    expect(theme.preference.value).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    expect(() => theme.setTheme("system")).not.toThrow();
    expect(theme.preference.value).toBe("system");
    wrapper.unmount();
  });

  it("applies the theme when storage access throws", async () => {
    const restore = blockStorageAccess();
    stubMatchMedia(true);
    try {
      const { result: theme, wrapper } = mountComposable(() => useTheme());
      await nextTick();

      expect(theme.isDark.value).toBe(true);
      expect(() => theme.setTheme("light")).not.toThrow();
      expect(theme.isDark.value).toBe(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      wrapper.unmount();
    } finally {
      restore();
    }
  });

  it("applies the theme when storage methods throw", async () => {
    vi.stubGlobal("localStorage", throwingStorage());
    stubMatchMedia(false);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    expect(() => theme.setTheme("dark")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(() => theme.setTheme("system")).not.toThrow();
    wrapper.unmount();
  });

  it("shares theme state between independent instances", async () => {
    stubMatchMedia(false);
    const first = mountComposable(() => useTheme());
    const second = mountComposable(() => useTheme());
    await nextTick();

    first.result.setTheme("dark");
    expect(second.result.preference.value).toBe("dark");
    expect(second.result.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    second.result.setTheme("light");
    expect(first.result.preference.value).toBe("light");
    expect(first.result.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    first.wrapper.unmount();
    second.wrapper.unmount();
  });

  it("follows theme changes made in another tab", async () => {
    const media = stubMatchMedia(false);
    const { result: theme, wrapper } = mountComposable(() => useTheme());
    await nextTick();

    localStorage.setItem(THEME_KEY, "dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }),
    );
    expect(theme.preference.value).toBe("dark");
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    window.dispatchEvent(
      new StorageEvent("storage", { key: "UNRELATED", newValue: "x" }),
    );
    expect(theme.preference.value).toBe("dark");

    localStorage.removeItem(THEME_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(theme.preference.value).toBe("system");
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("shares one media listener per mount session", async () => {
    const media = stubMatchMedia(false);
    const first = mountComposable(() => useTheme());
    await nextTick();
    expect(media.listeners).toHaveLength(1);

    const second = mountComposable(() => useTheme());
    await nextTick();
    expect(media.listeners).toHaveLength(1);

    first.wrapper.unmount();
    expect(media.listeners).toHaveLength(1);

    second.wrapper.unmount();
    expect(media.listeners).toHaveLength(0);
  });

  it("applies the pre-paint theme script before hydration", () => {
    const apply = () => {
      document.documentElement.removeAttribute("data-theme");
      // The script is a static constant shipped by this repository, not
      // untrusted input; it is evaluated to simulate the <head> execution.
      new Function(THEME_INIT_SCRIPT)(); // oxlint-disable-line no-new-func
    };

    stubMatchMedia(false);
    localStorage.setItem(THEME_KEY, "dark");
    apply();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    stubMatchMedia(true);
    localStorage.setItem(THEME_KEY, "light");
    apply();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    localStorage.removeItem(THEME_KEY);
    apply();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    stubMatchMedia(false);
    apply();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("emits an alert from an HTTP-style error", () => {
    const onAlert = (message: { text: string }) => {
      expect(message.text).toBe("backend error");
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    EventBus.on(EventTypes.ALERT_MESSAGE, onAlert);

    handleError({ response: { data: { error: "backend error" } } });

    EventBus.off(EventTypes.ALERT_MESSAGE, onAlert);
    log.mockRestore();
  });

  it("logs a sanitized error summary without the bearer token", () => {
    const token = validToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = {
      message: "Request failed with status code 401",
      config: {
        method: "get",
        url: "/api/secret?token=leaked",
        headers: new AxiosHeaders({
          Authorization: `Bearer ${token}`,
          "X-Request-Id": "req-1",
        }),
      },
      response: { status: 401 },
    };

    try {
      handleError(error);

      const summary = log.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(summary).toMatchObject({
        message: "Request failed with status code 401",
        status: 401,
        method: "get",
        path: "/api/secret",
      });

      const headers = summary.headers as Record<string, string>;
      const headerKey = Object.keys(headers).find(
        (name) => name.toLowerCase() === "authorization",
      );
      expect(headerKey).toBeDefined();
      expect(headers[headerKey as string]).toBe("[redacted]");
      expect(headers["X-Request-Id"]).toBe("req-1");

      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain("leaked");
    } finally {
      log.mockRestore();
    }
  });

  it("redacts raw header objects and JWT-shaped messages", () => {
    const token = validToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      handleError({
        message: `token ${token} leaked`,
        config: {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        },
      });

      const summary = log.mock.calls[0]?.[0] as Record<string, unknown>;
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain("Bearer ");
      expect(summary.headers).toEqual({
        Authorization: "[redacted]",
        Accept: "application/json",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("logs the raw error only in debug mode", () => {
    const token = validToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { config: { headers: { Authorization: `Bearer ${token}` } } };

    try {
      handleError(error, { debug: true });
      expect(log).toHaveBeenCalledWith(error);

      log.mockClear();
      handleError(error);
      expect(log).not.toHaveBeenCalledWith(error);
      expect(JSON.stringify(log.mock.calls[0]?.[0])).not.toContain(token);
    } finally {
      log.mockRestore();
    }
  });

  it("removes its AUTH_UPDATED listener when the store is disposed", () => {
    setActivePinia(createPinia());
    const listenerCount = () =>
      EventBus.all.get(EventTypes.AUTH_UPDATED)?.length ?? 0;
    const before = listenerCount();

    const authentication = AuthenticationStore();
    expect(listenerCount()).toBe(before + 1);

    authentication.$dispose();
    expect(listenerCount()).toBe(before);
  });

  it("creates the Pinia authentication store", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();

    expect(await authentication.ensureAuthenticated()).toBe(false);
    expect(authentication.isAuthenticated).toBe(false);
  });
});

describe("authentication store reactivity", () => {
  it("refreshes on token save and removal without an explicit call", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();
    expect(authentication.isAuthenticated).toBe(false);

    await AuthService.saveToken(validToken());
    await flushPromises();
    expect(authentication.isAuthenticated).toBe(true);

    await AuthService.removeToken();
    await flushPromises();
    expect(authentication.isAuthenticated).toBe(false);
  });

  it("turns false when getToken discards an expired token", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();
    await AuthService.saveToken(validToken());
    await flushPromises();
    expect(authentication.isAuthenticated).toBe(true);

    localStorage.setItem(AUTH_TOKEN_KEY, tokenWithExpiry(1));
    await expect(AuthService.getToken()).resolves.toBeNull();
    await flushPromises();

    expect(authentication.isAuthenticated).toBe(false);
  });

  it("turns false on a cross-tab token removal", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();
    await AuthService.saveToken(validToken());
    await authentication.ensureAuthenticated();
    expect(authentication.isAuthenticated).toBe(true);

    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: AUTH_TOKEN_KEY }));
    await flushPromises();

    expect(authentication.isAuthenticated).toBe(false);
  });
});
