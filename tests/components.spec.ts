import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import AlertMessages from "@devopsplaybook.io/common-web/components/AlertMessages.vue";
import AppNavigation from "@devopsplaybook.io/common-web/components/AppNavigation.vue";
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
import OfflineBanner from "@devopsplaybook.io/common-web/components/OfflineBanner.vue";
import {
  EventBus,
  EventTypes,
} from "@devopsplaybook.io/common-web/composables/EventBus";

const NuxtLinkStub = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h("a", { href: props.to }, slots.default?.());
  },
});

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
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    wrappers.push(wrapper);

    expect(wrapper.get("nav").attributes("aria-label")).toBe("Main navigation");
    expect(wrapper.get("a").attributes("href")).toBe("/");
    expect(wrapper.get("a").attributes("aria-current")).toBe("page");
    expect(wrapper.text()).toContain("Example");
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
