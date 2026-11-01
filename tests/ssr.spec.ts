// @vitest-environment node
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";

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
    expect(html).toContain("loading-indicator-small");
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("alert-messages");
    expect(html).toContain("offline-banner");
  });
});
