import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTypes, handleError } from "@devopsplaybook.io/common-web/composables/EventBus";
import type { AlertMessage } from "@devopsplaybook.io/common-web/composables/EventBus";
import { useAppHeight } from "@devopsplaybook.io/common-web/composables/useAppHeight";
import { useTheme } from "@devopsplaybook.io/common-web/composables/useTheme";
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import { AuthenticationStore } from "@devopsplaybook.io/common-web/stores/AuthenticationStore";

function tokenWithExpiry(
  exp: number,
  iat = Math.floor(Date.now() / 1000),
): string {
  const payload = btoa(
    JSON.stringify({ exp, iat }),
  );
  return `header.${payload}.signature`;
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    mediaQuery: "(prefers-color-scheme: dark)",
    addEventListener(
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      listeners.add(listener);
    },
    removeEventListener(
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList));
  return {
    setMatches(next: boolean): void {
      matches = next;
      listeners.forEach((listener) => {
        listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
}

function mountTheme() {
  let theme!: ReturnType<typeof useTheme>;
  const wrapper = mount(
    defineComponent({
      setup() {
        theme = useTheme();
        return () => h("div");
      },
    }),
  );
  return { theme, wrapper };
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  EventBus.all.clear();
  vi.unstubAllGlobals();
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
    expect(document.documentElement.style.getPropertyValue("--app-height")).toBe(
      "720px",
    );
    wrapper.unmount();
  });

  it("applies and persists an explicit theme preference", async () => {
    let theme!: ReturnType<typeof useTheme>;
    const wrapper = mount(
      defineComponent({
        setup() {
          theme = useTheme();
          return () => h("div");
        },
      }),
    );

    await nextTick();
    theme.setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("UI_THEME")).toBe("dark");
    theme.setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    wrapper.unmount();
  });

  it("resolves isDark from the system preference and reacts to changes", async () => {
    const media = installMatchMedia(true);
    const { theme, wrapper } = mountTheme();
    await nextTick();

    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    media.setMatches(false);
    await nextTick();
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    media.setMatches(true);
    await nextTick();
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    wrapper.unmount();
  });

  it("keeps an explicit theme overriding the system preference", async () => {
    const media = installMatchMedia(true);
    const { theme, wrapper } = mountTheme();
    await nextTick();

    theme.setTheme("light");
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    media.setMatches(false);
    await nextTick();
    expect(theme.isDark.value).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    theme.setTheme("dark");
    expect(theme.isDark.value).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    wrapper.unmount();
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

  it("preserves the error type and stack in the alert", () => {
    let message: AlertMessage | undefined;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    EventBus.on(EventTypes.ALERT_MESSAGE, (payload) => {
      message = payload;
    });

    handleError(new TypeError("boom"));

    expect(message?.type).toBe("error");
    expect(message?.text).toBe("TypeError: boom");
    expect(message?.stack).toContain("TypeError: boom");
    log.mockRestore();
  });

  it("creates the Pinia authentication store", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();

    expect(await authentication.ensureAuthenticated()).toBe(false);
    expect(authentication.isAuthenticated).toBe(false);
  });

  it("updates the authentication store when AUTH_UPDATED is emitted", async () => {
    setActivePinia(createPinia());
    const authentication = AuthenticationStore();

    await AuthService.saveToken(tokenWithExpiry(Date.now() / 1000 + 3600));
    await flushPromises();
    expect(authentication.isAuthenticated).toBe(true);

    await AuthService.removeToken();
    await flushPromises();
    expect(authentication.isAuthenticated).toBe(false);
  });
});
