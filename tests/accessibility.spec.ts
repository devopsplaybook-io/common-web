import axe from "axe-core";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";
import AppUpdateNotice from "@devopsplaybook.io/common-web/components/AppUpdateNotice.vue";
import {
  EventBus,
  EventTypes,
  type AlertMessage,
} from "@devopsplaybook.io/common-web/composables/EventBus";
import LoginCodeInput from "@devopsplaybook.io/common-web/components/LoginCodeInput.vue";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import type {
  LoginCodeCapabilities,
  LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

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

const SERVER_TIME = "2026-11-25T12:00:00.000Z";

function loginCodeCapabilities(
  overrides: Partial<LoginCodeCapabilities> = {},
): LoginCodeCapabilities {
  return {
    enabled: true,
    available: true,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 60_000,
    approveRequiresPassword: false,
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

function asService(service: object): LoginCodeService {
  return service as unknown as LoginCodeService;
}

function waitingDeviceService(): LoginCodeService {
  return asService({
    capabilities: () => Promise.resolve(loginCodeCapabilities()),
    create: () =>
      Promise.resolve({
        requestToken: "request-token",
        code: "BCDFGHJK",
        codeExpiresAt: "2026-11-25T12:00:30.000Z",
        expiresAt: "2026-11-25T12:05:00.000Z",
        serverTime: SERVER_TIME,
      }),
    poll: () => new Promise(() => {}),
    cancel: () =>
      Promise.resolve({ status: "cancelled", serverTime: SERVER_TIME }),
  });
}

function unusableDeviceService(): LoginCodeService {
  return asService({
    capabilities: () =>
      Promise.resolve(loginCodeCapabilities({ enabled: false })),
    create: () => Promise.reject(new Error("disabled")),
    poll: () => new Promise(() => {}),
    cancel: () => Promise.resolve({ status: "cancelled", serverTime: SERVER_TIME }),
  });
}

function previewService(requiresPassword: boolean): LoginCodeService {
  return asService({
    capabilities: () =>
      Promise.resolve(
        loginCodeCapabilities({ approveRequiresPassword: requiresPassword }),
      ),
    preview: () =>
      Promise.resolve({
        deviceLabel: "Chrome on macOS",
        userAgent: "Mozilla/5.0 (Macintosh) Chrome/120.0.0.0",
        createdAt: "2026-11-25T12:00:00.000Z",
        expiresAt: "2026-11-25T12:05:00.000Z",
        userName: "Ada Lovelace",
        serverTime: SERVER_TIME,
      }),
    approve: () =>
      Promise.resolve({
        approved: true,
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
  });
}

async function settle(turns = 40): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
  await nextTick();
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
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.findAll('button[aria-label="Dismiss"]')).toHaveLength(2);
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

  it("keeps two navigations with distinct labels accessible", async () => {
    const TwoNavs = defineComponent({
      name: "TwoNavs",
      render: () =>
        h("div", [
          h(AppNavigation, {
            links: [{ label: "Home", to: "/", active: true }],
            label: "Primary",
          }),
          h(AppNavigation, {
            links: [{ label: "Docs", to: "/docs" }],
            label: "Secondary",
          }),
        ]),
    });
    const wrapper = mountUnderMain(TwoNavs);
    const labels = wrapper
      .findAll("nav")
      .map((nav) => nav.attributes("aria-label"));
    expect(labels).toEqual(["Primary", "Secondary"]);
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

  it("keeps the hidden app update notice accessible", async () => {
    const wrapper = mountUnderMain(AppUpdateNotice);
    const region = wrapper.get('[data-testid="app-update-notice"]');
    expect(region.attributes("role")).toBe("status");
    expect(region.attributes("aria-live")).toBe("polite");
    expect(wrapper.findAll("button")).toHaveLength(0);
    await expectNoAxeViolations();
  });

  it("keeps the visible app update notice accessible", async () => {
    const wrapper = mountUnderMain(AppUpdateNotice, { visible: true });
    expect(wrapper.text()).toContain("New version available.");
    expect(wrapper.findAll("button")).toHaveLength(2);
    await expectNoAxeViolations();
  });

  it("keeps the login code input accessible", async () => {
    const wrapper = mountUnderMain(LoginCodeInput, { modelValue: "" });
    const input = wrapper.get("input");
    expect(wrapper.get("label").attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("aria-invalid")).toBeUndefined();
    await expectNoAxeViolations();
  });

  it("keeps the login code input error state accessible", async () => {
    const wrapper = mountUnderMain(LoginCodeInput, {
      modelValue: "BCDFGHJ",
      error: "That code is not valid.",
    });
    const input = wrapper.get("input");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(wrapper.get('[role="alert"]').text()).toBe("That code is not valid.");
    expect(input.attributes("aria-describedby")).toContain(
      wrapper.get('[role="alert"]').attributes("id"),
    );
    await expectNoAxeViolations();
  });

  it("keeps the waiting login card accessible", async () => {
    const wrapper = mountUnderMain(LoginWithCodeCard, {
      service: waitingDeviceService(),
    });
    await settle();
    expect(
      wrapper.get(".login-with-code-value").text().replace(/[^A-Z]/g, ""),
    ).toBe("BCDFGHJK");
    expect(wrapper.get(".login-with-code-status").attributes("role")).toBe(
      "status",
    );
    await expectNoAxeViolations();
  });

  it("keeps the unavailable login card accessible", async () => {
    const wrapper = mountUnderMain(LoginWithCodeCard, {
      service: unusableDeviceService(),
    });
    await settle();
    expect(wrapper.text()).toContain("Login with a code is unavailable");
    expect(wrapper.find("button").exists()).toBe(true);
    await expectNoAxeViolations();
  });

  it("keeps the unavailable authorize card accessible", async () => {
    const wrapper = mountUnderMain(AuthorizeDeviceCard, {
      service: asService({
        capabilities: () => Promise.reject(new Error("probe failed")),
      }),
    });
    await settle();
    expect(wrapper.text()).toContain("unavailable");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
    await expectNoAxeViolations();
  });

  it("keeps the password-protected authorize preview accessible", async () => {
    const wrapper = mountUnderMain(AuthorizeDeviceCard, {
      service: previewService(true),
    });
    await settle();
    await wrapper.get("input[type='text']").setValue("BCDFGHJK");
    await wrapper.get("form").trigger("submit");
    await settle();
    expect(wrapper.text()).toContain("Ada Lovelace");
    const passwordId = wrapper.get("input[type='password']").attributes("id");
    const labelled = wrapper
      .findAll("label")
      .some((label) => label.attributes("for") === passwordId);
    expect(labelled).toBe(true);
    await expectNoAxeViolations();
  });
});
