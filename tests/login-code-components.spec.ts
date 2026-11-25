import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginCodeInput from "@devopsplaybook.io/common-web/components/LoginCodeInput.vue";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import {
  LoginCodeError,
  type LoginCodeCapabilities,
  type LoginCodeErrorCode,
  type LoginCodeRequest,
  type LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

const SERVER_TIME = "2026-11-25T12:00:00.000Z";
const NOW = Date.parse(SERVER_TIME);

function capabilities(
  overrides: Partial<LoginCodeCapabilities> = {},
): LoginCodeCapabilities {
  return {
    enabled: true,
    available: true,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 2000,
    approveRequiresPassword: false,
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

function created(overrides: Partial<LoginCodeRequest> = {}): LoginCodeRequest {
  return {
    requestToken: "request-token",
    code: "BCDFGHJK",
    codeExpiresAt: "2026-11-25T12:00:30.000Z",
    expiresAt: "2026-11-25T12:05:00.000Z",
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

const PREVIEW = {
  deviceLabel: "Chrome on macOS",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Extra/1.0 Extra/1.0",
  createdAt: "2026-11-25T12:00:00.000Z",
  expiresAt: "2026-11-25T12:05:00.000Z",
  userName: "Ada Lovelace",
  serverTime: SERVER_TIME,
};

const APPROVAL = {
  approved: true as const,
  expiresAt: "2026-11-25T18:00:00.000Z",
  serverTime: SERVER_TIME,
};

function newDeviceService(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: vi.fn().mockResolvedValue(capabilities()),
    create: vi.fn().mockResolvedValue(created()),
    poll: vi.fn().mockReturnValue(new Promise(() => {})),
    cancel: vi
      .fn()
      .mockResolvedValue({ status: "cancelled", serverTime: SERVER_TIME }),
    ...overrides,
  };
}

function authorizeService(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: vi.fn().mockResolvedValue(capabilities()),
    preview: vi.fn().mockResolvedValue(PREVIEW),
    approve: vi.fn().mockResolvedValue(APPROVAL),
    ...overrides,
  };
}

function asService(service: object): LoginCodeService {
  return service as unknown as LoginCodeService;
}

async function settle(turns = 40): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

const wrappers: VueWrapper[] = [];

function mountComponent(
  component: Parameters<typeof mount>[0],
  props: Record<string, unknown> = {},
): VueWrapper {
  const wrapper = mount(component, { props });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonWithText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll("button").find((entry) => entry.text() === text);
  if (!button) throw new Error(`button "${text}" not found`);
  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LoginCodeInput", () => {
  it("renders a visible label, maxlength and accessible attributes", () => {
    const wrapper = mountComponent(LoginCodeInput, { modelValue: "" });

    expect(wrapper.get("label").text()).toBe("Login code");
    const input = wrapper.get("input");
    expect(wrapper.get("label").attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("maxlength")).toBe("8");
    expect(input.attributes("autocomplete")).toBe("off");
    expect(input.attributes("spellcheck")).toBe("false");
    expect(input.attributes("autocapitalize")).toBe("characters");
    expect(input.attributes("aria-label")).toBe("Login code");
    expect(input.attributes("aria-invalid")).toBeUndefined();
    expect(wrapper.find(".login-code-input-error").exists()).toBe(false);
  });

  it("spells the code in the accessible name", () => {
    const wrapper = mountComponent(LoginCodeInput, {
      modelValue: "BCDFGHJK",
    });

    expect(wrapper.get("input").attributes("aria-label")).toBe(
      "Login code: B C D F G H J K",
    );

    const custom = mountComponent(LoginCodeInput, {
      modelValue: "BCDFGHJK",
      label: "Pairing code",
    });
    expect(custom.get("input").attributes("aria-label")).toBe(
      "Pairing code: B C D F G H J K",
    );
  });

  it("normalises lowercase, spaces and dashes", async () => {
    const wrapper = mountComponent(LoginCodeInput, { modelValue: "" });

    await wrapper.get("input").setValue("bc df-ghjk");

    expect(wrapper.emitted("update:modelValue")).toEqual([["BCDFGHJK"]]);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "BCDFGHJK",
    );
  });

  it("accepts a grouped paste and enforces the length", async () => {
    const wrapper = mountComponent(LoginCodeInput, { modelValue: "" });

    await wrapper.get("input").trigger("paste", {
      clipboardData: { getData: () => "bcdf-ghjk-extra" },
    });

    expect(wrapper.emitted("update:modelValue")).toEqual([["BCDFGHJK"]]);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "BCDFGHJK",
    );
  });

  it("submits only a complete code on Enter", async () => {
    const partial = mountComponent(LoginCodeInput, { modelValue: "BCDF" });
    await partial.get("input").trigger("keydown", { key: "Enter" });
    expect(partial.emitted("submit")).toBeUndefined();

    const complete = mountComponent(LoginCodeInput, { modelValue: "BCDFGHJK" });
    await complete.get("input").trigger("keydown", { key: "Enter" });
    expect(complete.emitted("submit")).toHaveLength(1);
  });

  it("associates an error with the input", () => {
    const wrapper = mountComponent(LoginCodeInput, {
      modelValue: "BCDFGHJK",
      error: "That code is invalid",
      id: "code-field",
    });

    const input = wrapper.get("input");
    expect(input.attributes("id")).toBe("code-field");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toBe("code-field-error");
    expect(wrapper.get("#code-field-error").text()).toBe(
      "That code is invalid",
    );
    expect(wrapper.get("#code-field-error").attributes("role")).toBe("alert");
  });

  it("supports the disabled state and a custom length", () => {
    const wrapper = mountComponent(LoginCodeInput, {
      modelValue: "",
      disabled: true,
      length: 6,
    });

    expect(wrapper.get("input").attributes("disabled")).toBeDefined();
    expect(wrapper.get("input").attributes("maxlength")).toBe("6");
  });
});

describe("LoginWithCodeCard", () => {
  it("renders the grouped code, countdown and polite status", async () => {
    const service = newDeviceService();
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();

    expect(wrapper.get("h2").text()).toBe("Sign in with a code");
    expect(wrapper.get(".login-with-code-value").text()).toBe("BCDF-GHJK");
    expect(wrapper.text()).toContain("Login code: B C D F G H J K");
    expect(wrapper.text()).toContain("New code in 30s");
    expect(wrapper.text()).toContain("Expires in 300s");

    const status = wrapper.get('[role="status"]');
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.text()).toBe("Waiting for approval");
    expect(status.text()).not.toContain("New code in");

    expect(wrapper.findAll("a")).toHaveLength(0);
  });

  it("supports custom countdown templates", async () => {
    const service = newDeviceService();
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
      labels: { refreshIn: "{seconds}s until refresh" },
    });
    await settle();

    expect(wrapper.text()).toContain("30s until refresh");
  });

  it("copies the raw code and reverts the copied state after two seconds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const service = newDeviceService();
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();

    await buttonWithText(wrapper, "Copy code").trigger("click");
    await settle();

    expect(writeText).toHaveBeenCalledWith("BCDFGHJK");
    expect(buttonWithText(wrapper, "Copied").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1999);
    expect(buttonWithText(wrapper, "Copied").exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(buttonWithText(wrapper, "Copy code").exists()).toBe(true);
  });

  it("keeps the label when the clipboard rejects or is unavailable", async () => {
    const failing = vi
      .fn()
      .mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText: failing } });
    const service = newDeviceService();
    const first = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();
    await buttonWithText(first, "Copy code").trigger("click");
    await settle();
    expect(buttonWithText(first, "Copy code").exists()).toBe(true);
    first.unmount();
    wrappers.pop();

    vi.stubGlobal("navigator", {});
    const second = mountComponent(LoginWithCodeCard, {
      service: asService(newDeviceService()),
    });
    await settle();
    await buttonWithText(second, "Copy code").trigger("click");
    await settle();
    expect(buttonWithText(second, "Copy code").exists()).toBe(true);
  });

  it("clears the copy timer on unmount", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(newDeviceService()),
    });
    await settle();
    await buttonWithText(wrapper, "Copy code").trigger("click");
    await settle();

    wrapper.unmount();
    wrappers.pop();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports approval after the onSession prop resolves", async () => {
    let release!: () => void;
    const onSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const service = newDeviceService({
      poll: vi.fn().mockResolvedValue({
        status: "approved",
        token: "jwt",
        user: { id: "u1" },
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
      onSession,
    });
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Approved");
    expect(onSession).toHaveBeenCalledWith("jwt", { id: "u1" });
    expect(wrapper.emitted("approved")).toBeUndefined();

    release();
    await settle();

    expect(wrapper.emitted("approved")).toEqual([
      [{ token: "jwt", user: { id: "u1" } }],
    ]);
  });

  it("still reports approval when onSession rejects", async () => {
    const service = newDeviceService({
      poll: vi.fn().mockResolvedValue({
        status: "approved",
        token: "jwt",
        user: null,
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
    });
    const onSession = vi.fn(async () => {
      throw new Error("storage blocked");
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
      onSession,
    });
    await settle();

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Approved");
    expect(wrapper.emitted("approved")).toHaveLength(1);
  });

  it("renders the expired and cancelled copy", async () => {
    for (const [status, copy] of [
      ["expired", "Code expired"],
      ["cancelled", "Login cancelled"],
    ] as const) {
      const service = newDeviceService({
        poll: vi.fn().mockResolvedValue({
          status,
          expiresAt: "2026-11-25T18:00:00.000Z",
          serverTime: SERVER_TIME,
        }),
      });
      const wrapper = mountComponent(LoginWithCodeCard, {
        service: asService(service),
      });
      await settle();
      await vi.advanceTimersByTimeAsync(2000);
      await settle();

      expect(wrapper.get('[role="status"]').text()).toBe(copy);
      expect(wrapper.text()).toContain("Try again");
      wrapper.unmount();
      wrappers.pop();
    }
  });

  it("cancels the request and emits cancel", async () => {
    const service = newDeviceService();
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();

    await buttonWithText(wrapper, "Cancel").trigger("click");
    await settle();

    expect(service.cancel).toHaveBeenCalledWith("request-token");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.get('[role="status"]').text()).toBe("Login cancelled");
  });

  it("emits use-password even when the feature is unavailable", async () => {
    const service = newDeviceService({
      capabilities: vi.fn().mockResolvedValue(capabilities({ enabled: false })),
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
      autoStart: false,
    });
    await settle();

    expect(wrapper.text()).toContain("Login with a code is unavailable");
    expect(wrapper.find(".login-with-code-value").exists()).toBe(false);

    await buttonWithText(wrapper, "Use password instead").trigger("click");
    expect(wrapper.emitted("use-password")).toHaveLength(1);
  });

  it("does not create a request when autoStart is false", async () => {
    const service = newDeviceService();
    mountComponent(LoginWithCodeCard, {
      service: asService(service),
      autoStart: false,
    });
    await settle();

    expect(service.create).not.toHaveBeenCalled();
  });

  it("offers a fresh request after expiry", async () => {
    const service = newDeviceService({
      poll: vi.fn().mockResolvedValueOnce({
        status: "expired",
        expiresAt: "2026-11-25T18:00:00.000Z",
        serverTime: SERVER_TIME,
      }),
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Code expired");

    await buttonWithText(wrapper, "Try again").trigger("click");
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Waiting for approval");
    expect(service.create).toHaveBeenCalledTimes(2);
  });

  it("offers a retry after an error", async () => {
    const service = newDeviceService({
      create: vi
        .fn()
        .mockRejectedValueOnce(
          new LoginCodeError("RATE_LIMITED", undefined, { retryable: true }),
        )
        .mockResolvedValue(created()),
    });
    const wrapper = mountComponent(LoginWithCodeCard, {
      service: asService(service),
    });
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Something went wrong");

    await buttonWithText(wrapper, "Try again").trigger("click");
    await settle();

    expect(wrapper.get('[role="status"]').text()).toBe("Waiting for approval");
    expect(service.create).toHaveBeenCalledTimes(2);
  });
});

describe("AuthorizeDeviceCard", () => {
  async function authorizeWithPreview(
    service: ReturnType<typeof authorizeService>,
  ): Promise<VueWrapper> {
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });
    await settle();
    await wrapper.get("input[type='text']").setValue("bcdf-ghjk");
    await wrapper.get("form").trigger("submit");
    await settle();
    return wrapper;
  }

  it("shows the preparing state and disables the form while loading", async () => {
    const service = authorizeService({
      capabilities: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });

    expect(wrapper.text()).toContain("Checking availability…");
    expect(wrapper.get("input[type='text']").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
  });

  it("shows the unavailable state and keeps the warning visible", async () => {
    for (const capabilitiesValue of [
      capabilities({ enabled: false }),
      null,
    ]) {
      const service = authorizeService({
        capabilities:
          capabilitiesValue === null
            ? vi.fn().mockRejectedValue(new Error("down"))
            : vi.fn().mockResolvedValue(capabilitiesValue),
      });
      const wrapper = mountComponent(AuthorizeDeviceCard, {
        service: asService(service),
      });
      await settle();

      expect(wrapper.text()).toContain("Login with a code is unavailable");
      expect(wrapper.text()).toContain(
        "Only approve if you just started a login on that device",
      );
      expect(wrapper.get("input[type='text']").attributes("disabled")).toBeDefined();
      wrapper.unmount();
      wrappers.pop();
    }
  });

  it("previews a code and shows the device details", async () => {
    const service = authorizeService();
    const wrapper = await authorizeWithPreview(service);

    expect(service.preview).toHaveBeenCalledWith("BCDFGHJK", {
      signal: expect.any(AbortSignal),
    });
    expect(wrapper.text()).toContain("Will sign in as");
    expect(wrapper.text()).toContain("Ada Lovelace");
    expect(wrapper.text()).toContain("Chrome on macOS");

    const userAgent = wrapper.findAll("dd")[1]!;
    expect(userAgent.text()).toHaveLength(120);
    expect(userAgent.attributes("title")).toBe(PREVIEW.userAgent);

    const times = wrapper.findAll("time");
    expect(times[0]?.attributes("datetime")).toBe(PREVIEW.createdAt);
    expect(times[1]?.attributes("datetime")).toBe(PREVIEW.expiresAt);
    expect(times[0]?.text()).not.toBe("");
  });

  it("hides the password field unless the server requires it", async () => {
    const withoutPassword = await authorizeWithPreview(authorizeService());
    expect(withoutPassword.find("input[type='password']").exists()).toBe(false);
    withoutPassword.unmount();
    wrappers.pop();

    const withPassword = await authorizeWithPreview(
      authorizeService({
        capabilities: vi
          .fn()
          .mockResolvedValue(capabilities({ approveRequiresPassword: true })),
      }),
    );
    expect(withPassword.find("input[type='password']").exists()).toBe(true);
  });

  it("validates the code length locally without a request", async () => {
    const service = authorizeService();
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });
    await settle();

    await wrapper.get("input[type='text']").setValue("BCDF");
    await wrapper.get("form").trigger("submit");
    await settle();

    expect(service.preview).not.toHaveBeenCalled();
    expect(wrapper.get(".login-code-input-error").text()).toContain(
      "That code is invalid",
    );
  });

  it("approves without a password when none is required", async () => {
    const service = authorizeService();
    const wrapper = await authorizeWithPreview(service);

    await buttonWithText(wrapper, "Approve sign-in").trigger("click");
    await settle();

    expect(service.approve).toHaveBeenCalledWith(
      { code: "BCDFGHJK", password: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(wrapper.get(".authorize-device-success").attributes("role")).toBe(
      "status",
    );
    expect(wrapper.get(".authorize-device-success").text()).toBe(
      "Sign-in approved",
    );
    expect(wrapper.emitted("approved")).toEqual([[APPROVAL]]);
  });

  it("approves with a password and clears it afterwards", async () => {
    const service = authorizeService({
      capabilities: vi
        .fn()
        .mockResolvedValue(capabilities({ approveRequiresPassword: true })),
    });
    const wrapper = await authorizeWithPreview(service);
    await wrapper.get("input[type='password']").setValue("secret");

    await buttonWithText(wrapper, "Approve sign-in").trigger("click");
    await settle();

    expect(service.approve).toHaveBeenCalledWith(
      { code: "BCDFGHJK", password: "secret" },
      { signal: expect.any(AbortSignal) },
    );
    expect(
      (wrapper.get("input[type='password']").element as HTMLInputElement).value,
    ).toBe("");
  });

  it("requires a password locally when the server asks for one", async () => {
    const service = authorizeService({
      capabilities: vi
        .fn()
        .mockResolvedValue(capabilities({ approveRequiresPassword: true })),
    });
    const wrapper = await authorizeWithPreview(service);

    await buttonWithText(wrapper, "Approve sign-in").trigger("click");
    await settle();

    expect(service.approve).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Enter your password to approve this sign-in.",
    );
  });

  it("maps approve errors to generic copy and the documented states", async () => {
    const cases: Array<{
      code: LoginCodeErrorCode;
      copy: string;
      keepsPreview: boolean;
    }> = [
      {
        code: "INVALID_CODE",
        copy: "That code is invalid or has expired",
        keepsPreview: false,
      },
      {
        code: "ALREADY_USED",
        copy: "That code was already used",
        keepsPreview: false,
      },
      {
        code: "PASSWORD_REQUIRED",
        copy: "Enter your password to approve this sign-in.",
        keepsPreview: true,
      },
      {
        code: "RATE_LIMITED",
        copy: "Too many attempts",
        keepsPreview: true,
      },
      {
        code: "NETWORK",
        copy: "The request could not be completed",
        keepsPreview: true,
      },
      {
        code: "UNAUTHENTICATED",
        copy: "Sign in again to approve this device.",
        keepsPreview: false,
      },
      {
        code: "FORBIDDEN",
        copy: "This session cannot approve a sign-in.",
        keepsPreview: false,
      },
      {
        code: "HTTP_ERROR",
        copy: "The sign-in could not be approved. Try again.",
        keepsPreview: false,
      },
    ];

    for (const entry of cases) {
      const service = authorizeService({
        approve: vi
          .fn()
          .mockRejectedValue(
            new LoginCodeError(entry.code, "server detail must not leak"),
          ),
      });
      const wrapper = await authorizeWithPreview(service);

      await buttonWithText(wrapper, "Approve sign-in").trigger("click");
      await settle();

      expect(wrapper.text()).toContain(entry.copy);
      expect(wrapper.text()).not.toContain("server detail must not leak");
      expect(wrapper.text().includes("Will sign in as")).toBe(
        entry.keepsPreview,
      );
      wrapper.unmount();
      wrappers.pop();
    }
  });

  it("maps preview errors and returns to the code form", async () => {
    const service = authorizeService({
      preview: vi
        .fn()
        .mockRejectedValue(
          new LoginCodeError("ALREADY_USED", "server detail must not leak"),
        ),
    });
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });
    await settle();

    await wrapper.get("input[type='text']").setValue("BCDFGHJK");
    await wrapper.get("form").trigger("submit");
    await settle();

    expect(wrapper.get(".login-code-input-error").text()).toContain(
      "That code was already used",
    );
    expect(wrapper.text()).not.toContain("Will sign in as");
    expect(wrapper.text()).not.toContain("server detail must not leak");
  });

  it("resets the preview when the code is edited", async () => {
    const wrapper = await authorizeWithPreview(authorizeService());
    expect(wrapper.text()).toContain("Will sign in as");

    await wrapper.get("input[type='text']").setValue("ZXCVBNMQ");
    await settle();

    expect(wrapper.text()).not.toContain("Will sign in as");
  });

  it("cancels and resets the form", async () => {
    const wrapper = await authorizeWithPreview(authorizeService());
    await buttonWithText(wrapper, "Cancel").trigger("click");
    await settle();

    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Will sign in as");
    expect(
      (wrapper.get("input[type='text']").element as HTMLInputElement).value,
    ).toBe("");
  });

  it("does nothing while the feature is unavailable", async () => {
    const service = authorizeService({
      capabilities: vi.fn().mockResolvedValue(capabilities({ available: false })),
    });
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });
    await settle();

    await wrapper.get("form").trigger("submit");
    await settle();

    expect(service.preview).not.toHaveBeenCalled();
  });

  it("uses the injected service and aborts previews on unmount", async () => {
    let previewSignal: AbortSignal | undefined;
    const service = authorizeService({
      preview: vi.fn().mockImplementation(
        (_code: string, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            previewSignal = options?.signal;
            options?.signal?.addEventListener("abort", () =>
              reject(new LoginCodeError("ABORTED")),
            );
          }),
      ),
    });
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
    });
    await settle();
    expect(service.capabilities).toHaveBeenCalledTimes(1);

    await wrapper.get("input[type='text']").setValue("BCDFGHJK");
    await wrapper.get("form").trigger("submit");
    await settle();
    expect(previewSignal?.aborted).toBe(false);

    wrapper.unmount();
    wrappers.pop();

    expect(previewSignal?.aborted).toBe(true);
  });

  it("uses custom labels", async () => {
    const service = authorizeService();
    const wrapper = mountComponent(AuthorizeDeviceCard, {
      service: asService(service),
      labels: { title: "Confirm the new device", warning: "Be careful" },
    });
    await settle();

    expect(wrapper.get("h2").text()).toBe("Confirm the new device");
    expect(wrapper.text()).toContain("Be careful");
  });
});
