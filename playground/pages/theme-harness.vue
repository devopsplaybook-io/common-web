<template>
  <div class="theme-harness">
    <section data-scenario="login-waiting">
      <LoginWithCodeCard :service="waitingService" />
    </section>

    <section data-scenario="login-plain">
      <LoginWithCodeCard
        :service="plainService"
        variant="plain"
        :heading-level="3"
      />
    </section>

    <section data-scenario="login-error">
      <LoginWithCodeCard :service="failingService" />
    </section>

    <section data-scenario="authorize-entry">
      <AuthorizeDeviceCard :service="entryService" />
    </section>

    <section data-scenario="authorize-preview">
      <AuthorizeDeviceCard :service="previewService" />
    </section>

    <section data-scenario="authorize-error">
      <AuthorizeDeviceCard :service="previewErrorService" />
    </section>

    <section data-scenario="input-normal">
      <LoginCodeInput v-model="normalCode" />
    </section>

    <section data-scenario="input-error">
      <LoginCodeInput
        v-model="errorCode"
        error="That code is invalid or has expired. Check the code and try again."
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  LoginCodeError,
  type LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

// Layer host for the browser theme-contrast harness (e2e/theme-contrast.spec.ts).
// Same scenarios and no-network stub as tests/theme-host, rendered through the
// Nuxt layer so light and dark come from assets/css/tokens.css.
const SERVER_TIME = "2026-11-25T12:00:00.000Z";
const PREVIEW_CREATED_AT = "2026-11-25T12:00:00.000Z";
const PREVIEW_EXPIRES_AT = "2026-11-25T12:05:00.000Z";
const DEVICE_LABEL = "Pixel 8 (Chrome 139)";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

interface StubServiceOptions {
  createFails?: boolean;
  previewFails?: boolean;
}

function createStubService(
  options: StubServiceOptions = {},
): LoginCodeService {
  const inSeconds = (seconds: number): string =>
    new Date(Date.now() + seconds * 1000).toISOString();

  const service = {
    capabilities: async () => ({
      enabled: true,
      available: true,
      codeLength: 8,
      rotationSeconds: 30,
      graceSeconds: 60,
      ttlSeconds: 300,
      pollIntervalMs: 3_600_000,
      approveRequiresPassword: false,
      serverTime: SERVER_TIME,
    }),
    create: async () => {
      if (options.createFails) {
        throw new LoginCodeError("NETWORK", undefined, { retryable: true });
      }
      return {
        requestToken: "theme-harness-request",
        code: "BCDFGHJK",
        codeExpiresAt: inSeconds(30),
        expiresAt: inSeconds(300),
        serverTime: new Date().toISOString(),
      };
    },
    poll: () => new Promise<never>(() => {}),
    preview: async () => {
      if (options.previewFails) throw new LoginCodeError("RATE_LIMITED");
      return {
        deviceLabel: DEVICE_LABEL,
        userAgent: USER_AGENT,
        createdAt: PREVIEW_CREATED_AT,
        expiresAt: PREVIEW_EXPIRES_AT,
        userName: "Ada Lovelace",
        serverTime: SERVER_TIME,
      };
    },
    approve: async () => ({
      approved: true,
      expiresAt: PREVIEW_EXPIRES_AT,
      serverTime: SERVER_TIME,
    }),
    cancel: async () => ({
      status: "cancelled",
      serverTime: SERVER_TIME,
    }),
  };

  return service as unknown as LoginCodeService;
}

const waitingService = createStubService();
const plainService = createStubService();
const failingService = createStubService({ createFails: true });
const entryService = createStubService();
const previewService = createStubService();
const previewErrorService = createStubService({ previewFails: true });

const normalCode = ref("ABC123");
const errorCode = ref("ABC123");
</script>

<style>
/* Determinism for the harness: fixed 16px root, DejaVu font set (the CI image
   installs fonts-dejavu-core), no animations or transitions. */
html {
  font-size: 16px;
}

body {
  margin: 0;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: "DejaVu Sans", sans-serif;
}

.theme-harness {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.5rem;
}

[data-scenario] {
  margin: 0 0 2rem;
}

[data-scenario] *,
[data-scenario] *::before,
[data-scenario] *::after {
  animation: none !important;
  transition: none !important;
}

[data-scenario] code,
[data-scenario] input,
[data-scenario] .login-with-code-value,
[data-scenario] .login-code-input-field {
  font-family: "DejaVu Sans Mono", monospace !important;
}

[data-scenario] input {
  caret-color: transparent;
}
</style>
