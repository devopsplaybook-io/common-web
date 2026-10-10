import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";
import SettingsPage from "@devopsplaybook.io/common-web/components/SettingsPage.vue";
import {
  EventBus,
  EventTypes,
} from "@devopsplaybook.io/common-web/composables/EventBus";

const wrappers: Array<{ unmount: () => void }> = [];

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  EventBus.all.clear();
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
    EventBus.emit(EventTypes.ALERT_MESSAGE, {
      type: "info",
      text: "layer alert",
      durationMs: 30_000,
    });
    await nextTick();

    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.text()).toContain("layer alert");
    expect(wrapper.find(".message-info").exists()).toBe(true);
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
    expect(wrapper.get("a").attributes("aria-current")).toBe("page");
    expect(wrapper.text()).toContain("Example");
  });

  it("renders the settings page shell with tab roles and emits v-model updates", async () => {
    const wrapper = mount(SettingsPage, {
      props: {
        title: "Settings",
        tabs: [
          { id: "profile", label: "Profile" },
          { id: "statuses", label: "Statuses" },
        ],
        activeTab: "profile",
      },
      slots: { default: "<p>profile content</p>" },
    });
    wrappers.push(wrapper);

    expect(wrapper.find(".settings-page-title").text()).toBe("Settings");
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].classes()).toContain("settings-page-tab-active");
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[1].attributes("aria-selected")).toBe("false");

    const panel = wrapper.get('[role="tabpanel"]');
    expect(panel.text()).toContain("profile content");
    expect(panel.attributes("aria-labelledby")).toBe(tabs[0].attributes("id"));
    expect(tabs[0].attributes("aria-controls")).toBe(panel.attributes("id"));

    await tabs[1].trigger("click");
    expect(wrapper.emitted("update:activeTab")).toEqual([["statuses"]]);
  });

  it("renders the settings page title slot and ignores clicks on the active tab", async () => {
    const wrapper = mount(SettingsPage, {
      props: {
        tabs: [{ id: "profile", label: "Profile" }],
        activeTab: "profile",
      },
      slots: { title: "<span>Custom title</span>", default: "content" },
    });
    wrappers.push(wrapper);

    expect(wrapper.text()).toContain("Custom title");
    await wrapper.find('[role="tab"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")).toBeUndefined();
  });

  it("shows the offline banner when the browser goes offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    const wrapper = mount(OfflineBanner);
    wrappers.push(wrapper);
    await nextTick();
    expect(wrapper.find(".offline-banner").exists()).toBe(false);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));
    await nextTick();

    expect(wrapper.text()).toContain("You are offline");
    expect(wrapper.attributes("role")).toBe("status");
  });
});
