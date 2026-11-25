import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import AppUpdateNotice from "@devopsplaybook.io/common-web/components/AppUpdateNotice.vue";

const wrappers: VueWrapper[] = [];

function mountNotice(props: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(AppUpdateNotice, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("AppUpdateNotice", () => {
  it("renders a hidden but mounted live region by default", () => {
    const wrapper = mountNotice();
    const root = wrapper.get('[data-testid="app-update-notice"]');

    expect(root.attributes("role")).toBe("status");
    expect(root.attributes("aria-live")).toBe("polite");
    expect(root.attributes("aria-atomic")).toBe("true");
    expect(root.classes()).toContain("app-update-notice-hidden");
    expect(wrapper.find('[data-testid="app-update-message"]').exists()).toBe(
      false,
    );
    expect(wrapper.findAll("button")).toHaveLength(0);
  });

  it("renders the message and default labels when visible", () => {
    const wrapper = mountNotice({ visible: true });

    expect(
      wrapper.get('[data-testid="app-update-notice"]').classes(),
    ).not.toContain("app-update-notice-hidden");
    expect(wrapper.get('[data-testid="app-update-message"]').text()).toBe(
      "New version available.",
    );
    expect(wrapper.get('[data-testid="app-update-reload"]').text()).toBe(
      "Reload",
    );
    expect(wrapper.get('[data-testid="app-update-later"]').text()).toBe("Later");
  });

  it("renders custom copy", () => {
    const wrapper = mountNotice({
      visible: true,
      message: "A newer version is ready.",
      reloadLabel: "Update now",
      laterLabel: "Not now",
    });

    expect(wrapper.text()).toContain("A newer version is ready.");
    expect(wrapper.get('[data-testid="app-update-reload"]').text()).toBe(
      "Update now",
    );
    expect(wrapper.get('[data-testid="app-update-later"]').text()).toBe(
      "Not now",
    );
  });

  it("uses native, keyboard-reachable buttons", () => {
    const wrapper = mountNotice({ visible: true });
    const reload = wrapper.get('[data-testid="app-update-reload"]');
    const later = wrapper.get('[data-testid="app-update-later"]');

    expect(reload.attributes("type")).toBe("button");
    expect(later.attributes("type")).toBe("button");

    (reload.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(reload.element);
    (later.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(later.element);
  });

  it("emits once per button activation", async () => {
    const wrapper = mountNotice({ visible: true });

    await wrapper.get('[data-testid="app-update-reload"]').trigger("click");
    await wrapper.get('[data-testid="app-update-later"]').trigger("click");

    expect(wrapper.emitted("reload")).toHaveLength(1);
    expect(wrapper.emitted("later")).toHaveLength(1);
  });

  it("keeps the live region mounted when toggled like $pwa.needRefresh", async () => {
    const wrapper = mountNotice({ visible: false });
    expect(wrapper.find('[data-testid="app-update-notice"]').exists()).toBe(
      true,
    );

    await wrapper.setProps({ visible: true });
    expect(wrapper.find('[data-testid="app-update-message"]').exists()).toBe(
      true,
    );
    expect(wrapper.findAll("button")).toHaveLength(2);

    await wrapper.setProps({ visible: false });
    expect(wrapper.find('[data-testid="app-update-notice"]').exists()).toBe(
      true,
    );
    expect(wrapper.findAll("button")).toHaveLength(0);
  });
});
