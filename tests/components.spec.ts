import { mount } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function emitAlert(message: AlertMessage): void {
  EventBus.emit(EventTypes.ALERT_MESSAGE, message);
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  EventBus.all.clear();
  vi.useRealTimers();
});

describe("components from the packed layer", () => {
  it("renders the accessible loading indicator and small variant", () => {
    const wrapper = mount(Loading, { props: { size: "small" } });
    wrappers.push(wrapper);

    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.classes()).toContain("loading-indicator-small");
  });

  it("renders and dismisses event-bus alerts", async () => {
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "layer alert", durationMs: 30_000 });
    await nextTick();

    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.text()).toContain("layer alert");
    expect(wrapper.find(".alert-message-info").exists()).toBe(true);
    expect(wrapper.find(".alert-message-text").exists()).toBe(true);
    expect(wrapper.find(".message").exists()).toBe(false);
  });

  it("keeps sticky alerts (durationMs 0) until dismissed", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "warning", text: "sticky alert", durationMs: 0 });
    await nextTick();

    vi.advanceTimersByTime(60_000);
    expect(wrapper.text()).toContain("sticky alert");
  });

  it("dismisses alerts after the default five seconds", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "temporary alert" });
    await nextTick();
    expect(wrapper.text()).toContain("temporary alert");

    vi.advanceTimersByTime(5_000);
    await nextTick();
    expect(wrapper.text()).not.toContain("temporary alert");
  });

  it("deduplicates identical alerts", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "same text" });
    emitAlert({ type: "info", text: "same text" });
    emitAlert({ type: "error", text: "same text" });
    await nextTick();

    expect(wrapper.findAll(".alert-message")).toHaveLength(2);
  });

  it("caps the queue at five messages, dropping the oldest", async () => {
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    for (let index = 1; index <= 6; index += 1) {
      emitAlert({ type: "info", text: `message ${index}`, durationMs: 0 });
    }
    await nextTick();

    expect(wrapper.findAll(".alert-message")).toHaveLength(5);
    expect(wrapper.text()).not.toContain("message 1");
    expect(wrapper.text()).toContain("message 6");
  });

  it("clears pending timers on unmount", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    emitAlert({ type: "info", text: "pending alert" });
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders configurable navigation links and brand slot", () => {
    const wrapper = mount(AppNavigation, {
      props: {
        links: [{ label: "Home", to: "/", active: true }],
      },
      slots: { brand: "<strong>Example</strong>" },
    });
    wrappers.push(wrapper);

    expect(wrapper.get("nav").attributes("aria-label")).toBe("Main navigation");
    expect(wrapper.get("a").attributes("href")).toBe("/");
    expect(wrapper.get("a").attributes("aria-current")).toBe("page");
    expect(wrapper.text()).toContain("Example");
  });

  it("renders a custom link component receiving the navigation target", () => {
    const LinkStub = defineComponent({
      props: { to: { type: String, default: undefined } },
      setup(props, { slots }) {
        return () => h("a", { class: "stub-link", href: props.to }, slots.default?.());
      },
    });
    const wrapper = mount(AppNavigation, {
      props: {
        links: [{ label: "Home", to: "/", active: true }],
        linkComponent: markRaw(LinkStub),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.findComponent(LinkStub).props("to")).toBe("/");
    expect(wrapper.get("a.stub-link").attributes("aria-current")).toBe("page");
  });

  it("keeps the offline live region mounted but hidden while online", async () => {
    setOnline(true);
    const wrapper = mount(OfflineBanner);
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.find(".offline-banner").exists()).toBe(true);
    expect(wrapper.classes()).toContain("offline-banner-hidden");
    expect(wrapper.text()).toBe("");
    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-live")).toBe("polite");
  });

  it("announces the neutral offline message when going offline", async () => {
    setOnline(true);
    const wrapper = mount(OfflineBanner);
    wrappers.push(wrapper);
    await nextTick();

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    await nextTick();

    expect(wrapper.text()).toBe("You are offline.");
    expect(wrapper.classes()).not.toContain("offline-banner-hidden");
  });

  it("shows the offline message immediately when mounted offline", async () => {
    setOnline(false);
    const wrapper = mount(OfflineBanner);
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.text()).toBe("You are offline.");
  });

  it("overrides the offline copy through the message prop", async () => {
    setOnline(false);
    const wrapper = mount(OfflineBanner, {
      props: { message: "No connection available." },
    });
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.text()).toBe("No connection available.");
  });
});
