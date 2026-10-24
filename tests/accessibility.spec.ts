import axe from "axe-core";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";
import {
  EventBus,
  EventTypes,
  type AlertMessage,
} from "@devopsplaybook.io/common-web/composables/EventBus";

const wrappers: Array<{ unmount: () => void }> = [];

function mountUnderMain(
  component: Component,
  props: Record<string, unknown> = {},
  slots: Record<string, () => unknown> = {},
): VueWrapper {
  const Main = defineComponent({
    name: "MainWrapper",
    render: () =>
      h("main", [
        h(component, props, Object.keys(slots).length > 0 ? slots : undefined),
      ]),
  });
  const wrapper = mount(Main, { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

async function expectNoAxeViolations(): Promise<void> {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false } },
  });
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .map((node) => node.html)
        .join(", ")}`,
  );
  expect(violations).toEqual([]);
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

beforeEach(() => {
  // jsdom documents carry no title or language; the axe best-practice rules
  // for both are page-level concerns outside the components under test.
  document.title = "common-web accessibility tests";
  document.documentElement.lang = "en";
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  EventBus.all.clear();
});

describe("accessibility of the shipped components (axe)", () => {
  it("keeps the default loading indicator accessible", async () => {
    const wrapper = mountUnderMain(Loading);
    expect(document.body.contains(wrapper.element)).toBe(true);
    expect(wrapper.get(".loading-indicator").attributes("aria-label")).toBe(
      "Loading",
    );
    await expectNoAxeViolations();
  });

  it("keeps the small loading indicator accessible", async () => {
    const wrapper = mountUnderMain(Loading, { size: "small" });
    expect(document.body.contains(wrapper.element)).toBe(true);
    await expectNoAxeViolations();
  });

  it("keeps event-bus alerts accessible", async () => {
    const wrapper = mountUnderMain(AlertMessages);
    const info: AlertMessage = { type: "info", text: "info message" };
    const error: AlertMessage = { type: "error", text: "error message" };
    EventBus.emit(EventTypes.ALERT_MESSAGE, info);
    EventBus.emit(EventTypes.ALERT_MESSAGE, error);
    await nextTick();
    expect(wrapper.text()).toContain("info message");
    expect(wrapper.text()).toContain("error message");
    await expectNoAxeViolations();
  });

  it("keeps the default navigation accessible", async () => {
    const wrapper = mountUnderMain(
      AppNavigation,
      {
        links: [
          { label: "Home", to: "/", active: true },
          { label: "Docs", to: "/docs" },
          { label: "Search", to: "/search", icon: "icon-search" },
        ],
      },
      { brand: () => h("strong", "Example") },
    );
    expect(wrapper.get("nav").attributes("aria-label")).toBe("Main navigation");
    expect(wrapper.get("a[aria-current='page']").attributes("href")).toBe("/");
    await expectNoAxeViolations();
  });

  it("keeps a custom link component accessible", async () => {
    const LinkStub = defineComponent({
      props: { to: { type: String, default: undefined } },
      setup(props, { slots }) {
        return () =>
          h("a", { class: "stub-link", href: props.to }, slots.default?.());
      },
    });
    const wrapper = mountUnderMain(AppNavigation, {
      links: [{ label: "Home", to: "/", active: true }],
      linkComponent: markRaw(LinkStub),
    });
    expect(wrapper.get("a.stub-link").attributes("aria-current")).toBe("page");
    await expectNoAxeViolations();
  });

  it("keeps the hidden live region accessible while online", async () => {
    setOnline(true);
    const wrapper = mountUnderMain(OfflineBanner);
    await nextTick();
    expect(wrapper.find(".offline-banner").classes()).toContain(
      "offline-banner-hidden",
    );
    await expectNoAxeViolations();
  });

  it("keeps the offline banner accessible with the default copy", async () => {
    setOnline(false);
    const wrapper = mountUnderMain(OfflineBanner);
    await nextTick();
    expect(wrapper.text()).toBe("You are offline.");
    await expectNoAxeViolations();
  });

  it("keeps the offline banner accessible with a custom message", async () => {
    setOnline(false);
    const wrapper = mountUnderMain(OfflineBanner, {
      message: "No connection available.",
    });
    await nextTick();
    expect(wrapper.text()).toBe("No connection available.");
    await expectNoAxeViolations();
  });

  it("keeps the offline banner accessible with default-slot content", async () => {
    setOnline(false);
    const wrapper = mountUnderMain(
      OfflineBanner,
      {},
      { default: () => h("span", "Showing cached content.") },
    );
    await nextTick();
    expect(wrapper.text()).toContain("Showing cached content.");
    await expectNoAxeViolations();
  });
});
