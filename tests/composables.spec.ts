import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
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
