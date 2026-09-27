import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTypes, handleError } from "@devopsplaybook.io/common-web/composables/EventBus";
import { useAppHeight } from "@devopsplaybook.io/common-web/composables/useAppHeight";
import { useTheme } from "@devopsplaybook.io/common-web/composables/useTheme";
import { AuthenticationStore } from "@devopsplaybook.io/common-web/stores/AuthenticationStore";

afterEach(() => {
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
    expect(document.documentElement.style.getPropertyValue("--app-height")).toBe(
      "720px",
    );
    wrapper.unmount();
  });

  it("applies and persists an explicit theme preference", async () => {
    let theme!: ReturnType<typeof useTheme>;
    const wrapper = mount(
      defineComponent({
        setup() {
          theme = useTheme();
          return () => h("div");
        },
      }),
    );

    await nextTick();
    theme.setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("UI_THEME")).toBe("dark");
    theme.setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    wrapper.unmount();
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
