import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginCodeInput from "@devopsplaybook.io/common-web/components/LoginCodeInput.vue";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import type { LoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";

const SOURCE_ROOT = process.env.COMMON_WEB_PACKED_DIR ?? process.cwd();

const SHIPPED_FILES = [
  "services/LoginCodeService.ts",
  "composables/useLoginCode.ts",
  "components/LoginCodeInput.vue",
  "components/LoginWithCodeCard.vue",
  "components/AuthorizeDeviceCard.vue",
];

// Identifiers only available through a Nuxt application context.
const FORBIDDEN = [
  "#imports",
  "useRuntimeConfig",
  "useState",
  "useNuxtApp",
  "defineNuxtPlugin",
  "navigateTo",
  "useHead",
  "useAsyncData",
  "useFetch",
  "useRoute",
  "useRouter",
  'from "nuxt"',
  'from "#app"',
];

const ALLOWED_IMPORTS = new Set([
  "vue",
  "axios",
  "./Config",
  "../services/LoginCodeService",
  "../composables/useLoginCode",
  "./LoginCodeInput.vue",
]);

function sourceOf(file: string): string {
  return readFileSync(join(SOURCE_ROOT, file), "utf8");
}

function importedSpecifiers(source: string): string[] {
  return [...source.matchAll(/import\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
}

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("login-with-code sources do not depend on Nuxt", () => {
  it("contains no Nuxt-only identifiers", () => {
    for (const file of SHIPPED_FILES) {
      const source = sourceOf(file);
      for (const forbidden of FORBIDDEN) {
        expect(source, `${file} must not reference ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it("only imports from the documented plain-Vue modules", () => {
    for (const file of SHIPPED_FILES) {
      const specifiers = importedSpecifiers(sourceOf(file));
      expect(specifiers.length, `${file} has imports`).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        expect(
          ALLOWED_IMPORTS.has(specifier),
          `${file} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it("mounts the components in a plain Vitest environment without warnings", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = {
      capabilities: vi.fn().mockResolvedValue({
        enabled: false,
        available: false,
        codeLength: 8,
        rotationSeconds: 30,
        graceSeconds: 60,
        ttlSeconds: 300,
        pollIntervalMs: 2000,
        approveRequiresPassword: false,
        serverTime: "2026-11-25T12:00:00.000Z",
      }),
      create: vi.fn(),
      poll: vi.fn(),
      cancel: vi.fn(),
      preview: vi.fn(),
      approve: vi.fn(),
    } as unknown as LoginCodeService;

    wrappers.push(
      mount(LoginCodeInput, { props: { modelValue: "BCDFGHJK" } }),
      mount(LoginWithCodeCard, { props: { service, autoStart: false } }),
      mount(AuthorizeDeviceCard, { props: { service } }),
    );
    await flushPromises();

    expect(wrappers[0]!.text()).toContain("Login code");
    expect(wrappers[1]!.text()).toContain("Sign in with a code");
    expect(wrappers[2]!.text()).toContain("Approve a sign-in");

    const warnings = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes("Failed to resolve component"));
    expect(warnings).toEqual([]);
  });
});
