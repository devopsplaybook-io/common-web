import { createSSRApp, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("OfflineBanner hydration", () => {
  it("hydrates a page loaded offline without a mismatch", async () => {
    // The server never sees a browser, so simulate its HTML while online.
    setOnline(true);
    const serverHtml = await renderToString(createSSRApp(OfflineBanner));

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    setOnline(false);
    createSSRApp(OfflineBanner).mount(container);
    await nextTick();

    const messages = [...warn.mock.calls, ...error.mock.calls].map((call) =>
      call.map(String).join(" "),
    );
    expect(messages.filter((message) => /hydrat/i.test(message))).toEqual([]);
    expect(container.textContent).toContain("You are offline.");
  });
});
