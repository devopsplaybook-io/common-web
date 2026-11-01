// @vitest-environment node
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createHead, renderSSRHead } from "unhead/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";
import {
  THEME_INIT_SCRIPT,
  THEME_SCRIPT_KEY,
  THEME_SCRIPT_NONCE_ENV,
  themeInitScriptEntry,
  themeScriptNonceFromEnv,
} from "@devopsplaybook.io/common-web/composables/theme";
import { useTheme } from "@devopsplaybook.io/common-web/composables/useTheme";
import { PreferencesService } from "@devopsplaybook.io/common-web/services/PreferencesService";
import { RefreshIntervalService } from "@devopsplaybook.io/common-web/services/RefreshIntervalService";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SSR rendering", () => {
  it("runs without browser globals", () => {
    expect(typeof document).toBe("undefined");
  });

  it("renders the shipped components on the server", async () => {
    const app = createSSRApp({
      render: () =>
        h("main", [
          h(Loading, { size: "small" }),
          h(AppNavigation, {
            links: [{ label: "Home", to: "/", active: true }],
          }),
          h(AlertMessages),
          h(OfflineBanner),
        ]),
    });

    const html = await renderToString(app);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("loading-indicator-small");
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("alert-messages");
    expect(html).toContain("offline-banner");
  });

  it("server-renders the offline banner hidden", async () => {
    const html = await renderToString(createSSRApp(OfflineBanner));

    expect(html).toContain("offline-banner-hidden");
    expect(html).not.toContain("You are offline.");
  });

  it("renders useTheme with the default system preference", async () => {
    const ThemeProbe = defineComponent({
      setup() {
        const { preference, isDark } = useTheme();
        return () =>
          h("span", `${preference.value}/${isDark.value ? "dark" : "light"}`);
      },
    });

    const html = await renderToString(createSSRApp(ThemeProbe));

    expect(html).toContain("system/light");
  });

  it("uses the documented storage fallbacks without a browser", () => {
    expect(PreferencesService.get("density")).toBeNull();
    expect(() => PreferencesService.set("density", "compact")).not.toThrow();
    expect(() => PreferencesService.remove("density")).not.toThrow();

    expect(RefreshIntervalService.get()).toBe(RefreshIntervalService.DEFAULT);
    expect(() => RefreshIntervalService.set("5000")).not.toThrow();
    expect(() => RefreshIntervalService.set("abc")).toThrow(TypeError);
  });
});

describe("theme script nonce", () => {
  it("reads a trimmed nonce from the environment", () => {
    vi.stubEnv(THEME_SCRIPT_NONCE_ENV, "  nonce-123  ");
    expect(themeScriptNonceFromEnv()).toBe("nonce-123");
  });

  it("returns undefined when the nonce is blank or absent", () => {
    vi.stubEnv(THEME_SCRIPT_NONCE_ENV, "   ");
    expect(themeScriptNonceFromEnv()).toBeUndefined();

    vi.unstubAllEnvs();
    expect(themeScriptNonceFromEnv()).toBeUndefined();
  });

  it("returns the head entry with a nonce only when supplied", () => {
    expect(themeInitScriptEntry("nonce-123")).toEqual({
      key: THEME_SCRIPT_KEY,
      innerHTML: THEME_INIT_SCRIPT,
      nonce: "nonce-123",
    });

    const plain = themeInitScriptEntry();
    expect(plain).toEqual({
      key: THEME_SCRIPT_KEY,
      innerHTML: THEME_INIT_SCRIPT,
    });
    expect("nonce" in plain).toBe(false);
  });

  it("renders the nonce on the injected script tag", async () => {
    const head = createHead();
    head.push({ script: [themeInitScriptEntry("nonce-123")] });
    const rendered = await renderSSRHead(head);

    expect(rendered.headTags).toContain(
      `<script nonce="nonce-123" data-hid="${THEME_SCRIPT_KEY}">`,
    );

    const plainHead = createHead();
    plainHead.push({ script: [themeInitScriptEntry()] });
    const plainRendered = await renderSSRHead(plainHead);

    expect(plainRendered.headTags).toContain(
      `<script data-hid="${THEME_SCRIPT_KEY}">`,
    );
    expect(plainRendered.headTags).not.toContain("nonce=");
  });
});
