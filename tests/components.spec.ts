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
  vi.restoreAllMocks();
});

describe("components from the packed layer", () => {
  it("renders the accessible loading indicator and small variant", () => {
    const wrapper = mount(Loading, { props: { size: "small" } });
    wrappers.push(wrapper);

    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.classes()).toContain("loading-indicator-small");
  });

  it("renders event-bus alerts in the polite region", async () => {
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "layer alert", durationMs: 30_000 });
    await nextTick();

    expect(
      wrapper.get('[role="status"]').attributes("aria-live"),
    ).toBe("polite");
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

  it("dismisses a sticky alert with the mouse", async () => {
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "warning", text: "sticky alert", durationMs: 0 });
    await nextTick();

    await wrapper.get(".alert-message-dismiss").trigger("click");
    expect(wrapper.text()).not.toContain("sticky alert");
  });

  it("exposes an accessible button that dismisses through keyboard activation", async () => {
    const wrapper = mount(AlertMessages, { attachTo: document.body });
    wrappers.push(wrapper);
    emitAlert({ type: "warning", text: "keyboard alert", durationMs: 0 });
    await nextTick();

    const button = wrapper.get("button.alert-message-dismiss");
    const element = button.element as HTMLButtonElement;
    expect(element.tagName).toBe("BUTTON");
    expect(button.attributes("type")).toBe("button");
    expect(button.attributes("aria-label")).toBe("Dismiss");
    expect(element.tabIndex).toBe(0);

    element.focus();
    expect(document.activeElement).toBe(element);
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 }),
    );
    await nextTick();
    expect(wrapper.text()).not.toContain("keyboard alert");
  });

  it("clears the pending timer when an alert is dismissed manually", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "timed alert", durationMs: 10_000 });
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);

    await wrapper.get(".alert-message-dismiss").trigger("click");
    expect(vi.getTimerCount()).toBe(0);
    expect(wrapper.text()).not.toContain("timed alert");
  });

  it("clamps negative durations to a sticky alert", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "warning", text: "clamped alert", durationMs: -1000 });
    await nextTick();

    vi.advanceTimersByTime(60_000);
    expect(wrapper.text()).toContain("clamped alert");
  });

  it("falls back to the default duration for non-finite values", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "nan alert", durationMs: Number.NaN });
    emitAlert({
      type: "info",
      text: "infinite alert",
      durationMs: Number.POSITIVE_INFINITY,
    });
    await nextTick();

    vi.advanceTimersByTime(4_999);
    await nextTick();
    expect(wrapper.text()).toContain("nan alert");
    expect(wrapper.text()).toContain("infinite alert");

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(wrapper.text()).not.toContain("nan alert");
    expect(wrapper.text()).not.toContain("infinite alert");
  });

  it("announces errors assertively in a sibling region without double announcements", async () => {
    const wrapper = mount(AlertMessages);
    wrappers.push(wrapper);
    emitAlert({ type: "info", text: "info alert" });
    emitAlert({ type: "success", text: "success alert" });
    emitAlert({ type: "warning", text: "warning alert" });
    emitAlert({ type: "error", text: "error alert" });
    await nextTick();

    const status = wrapper.get('[role="status"]');
    const alert = wrapper.get('[role="alert"]');
    expect(status.attributes("aria-live")).toBe("polite");
    expect(alert.attributes("aria-live")).toBe("assertive");
    expect(status.attributes("aria-atomic")).toBe("false");
    expect(alert.attributes("aria-atomic")).toBe("false");

    expect(status.text()).toContain("info alert");
    expect(status.text()).toContain("success alert");
    expect(status.text()).toContain("warning alert");
    expect(status.text()).not.toContain("error alert");
    expect(alert.text()).toContain("error alert");
    expect(alert.text()).not.toContain("info alert");
    expect(status.findAll(".alert-message")).toHaveLength(3);
    expect(alert.findAll(".alert-message")).toHaveLength(1);
    expect(wrapper.findAll(".alert-message")).toHaveLength(4);
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

  it("labels two navigation instances distinctly", () => {
    const TwoNavs = defineComponent({
      render: () =>
        h("div", [
          h(AppNavigation, {
            links: [{ label: "Home", to: "/" }],
            label: "Primary",
          }),
          h(AppNavigation, {
            links: [{ label: "Docs", to: "/docs" }],
            label: "Secondary",
          }),
        ]),
    });
    const wrapper = mount(TwoNavs);
    wrappers.push(wrapper);

    const labels = wrapper
      .findAll("nav")
      .map((nav) => nav.attributes("aria-label"));
    expect(labels).toEqual(["Primary", "Secondary"]);
  });

  it("renders duplicate link targets without Vue key warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mount(AppNavigation, {
      props: {
        links: [
          { label: "Home", to: "/" },
          { label: "Home again", to: "/" },
        ],
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.findAll("a")).toHaveLength(2);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(
      messages.some((message) => message.includes("duplicate link target")),
    ).toBe(true);
    expect(messages.some((message) => message.includes("Duplicate keys"))).toBe(
      false,
    );
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
