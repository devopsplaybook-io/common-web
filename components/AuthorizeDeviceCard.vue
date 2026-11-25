<template>
  <section class="authorize-device-card" :aria-labelledby="titleId">
    <h2 :id="titleId" class="authorize-device-title">{{ copy.title }}</h2>
    <p class="authorize-device-warning">{{ copy.warning }}</p>

    <p v-if="loading" class="authorize-device-preparing">
      {{ copy.preparing }}
    </p>
    <p v-else-if="unavailable" class="authorize-device-unavailable">
      {{ copy.unavailable }}
    </p>

    <form class="authorize-device-form" @submit.prevent="submitCode">
      <LoginCodeInput
        v-model="codeValue"
        :label="copy.codeLabel"
        :length="codeLength"
        :error="codeError ?? undefined"
        :disabled="formDisabled"
        @submit="submitCode"
      />
      <button
        type="submit"
        class="authorize-device-button authorize-device-button-primary"
        :disabled="formDisabled"
      >
        {{ copy.preview }}
      </button>
    </form>

    <p v-if="formError" class="authorize-device-error" role="alert">
      {{ formError }}
    </p>

    <div v-if="previewResult && !unavailable" class="authorize-device-preview">
      <p class="authorize-device-sign-in">
        {{ copy.willSignInAs }}
        <strong>{{ previewResult.userName }}</strong>
      </p>
      <dl class="authorize-device-details">
        <dt>{{ copy.deviceLabel }}</dt>
        <dd>{{ previewResult.deviceLabel }}</dd>
        <dt>{{ copy.userAgentLabel }}</dt>
        <dd :title="previewResult.userAgent">{{ truncatedUserAgent }}</dd>
        <dt>{{ copy.requestedAt }}</dt>
        <dd>
          <time :datetime="previewResult.createdAt">
            {{ formatDate(previewResult.createdAt) }}
          </time>
        </dd>
        <dt>{{ copy.expiresAt }}</dt>
        <dd>
          <time :datetime="previewResult.expiresAt">
            {{ formatDate(previewResult.expiresAt) }}
          </time>
        </dd>
      </dl>

      <div v-if="requiresPassword" class="authorize-device-password">
        <label :for="passwordId" class="authorize-device-label">
          {{ copy.password }}
        </label>
        <input
          :id="passwordId"
          v-model="password"
          class="authorize-device-input"
          type="password"
          autocomplete="current-password"
          :disabled="busy"
        />
      </div>

      <p
        v-if="successMessage"
        class="authorize-device-success"
        role="status"
        aria-live="polite"
      >
        {{ successMessage }}
      </p>

      <div class="authorize-device-actions">
        <button
          type="button"
          class="authorize-device-button authorize-device-button-primary"
          :disabled="busy || !available"
          @click="approve"
        >
          {{ copy.approve }}
        </button>
        <button
          type="button"
          class="authorize-device-button authorize-device-button-secondary"
          :disabled="busy"
          @click="reset"
        >
          {{ copy.cancel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch } from "vue";
import LoginCodeInput from "./LoginCodeInput.vue";
import {
  LoginCodeError,
  LoginCodeService,
  type LoginCodeApproval,
  type LoginCodeCapabilities,
  type LoginCodeErrorCode,
  type LoginCodePreview,
} from "../services/LoginCodeService";

interface AuthorizeDeviceCardLabels {
  title: string;
  warning: string;
  codeLabel: string;
  preview: string;
  approve: string;
  cancel: string;
  password: string;
  willSignInAs: string;
  deviceLabel: string;
  userAgentLabel: string;
  requestedAt: string;
  expiresAt: string;
  approved: string;
  unavailable: string;
  preparing: string;
  invalidCode: string;
  alreadyUsed: string;
  rateLimited: string;
  passwordRequired: string;
  unauthenticated: string;
  forbidden: string;
  network: string;
  generic: string;
}

const DEFAULT_LABELS: AuthorizeDeviceCardLabels = {
  title: "Approve a sign-in",
  warning: "Only approve if you just started a login on that device",
  codeLabel: "Login code",
  preview: "Continue",
  approve: "Approve sign-in",
  cancel: "Cancel",
  password: "Password",
  willSignInAs: "Will sign in as",
  deviceLabel: "Device",
  userAgentLabel: "User agent",
  requestedAt: "Requested",
  expiresAt: "Expires",
  approved: "Sign-in approved",
  unavailable: "Login with a code is unavailable",
  preparing: "Checking availability…",
  invalidCode: "That code is invalid or has expired. Check the code and try again.",
  alreadyUsed: "That code was already used. Ask the other device for a new code.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  passwordRequired: "Enter your password to approve this sign-in.",
  unauthenticated: "Sign in again to approve this device.",
  forbidden: "This session cannot approve a sign-in.",
  network: "The request could not be completed. Check your connection and try again.",
  generic: "The sign-in could not be approved. Try again.",
};

const props = withDefaults(
  defineProps<{
    service?: LoginCodeService;
    labels?: Partial<AuthorizeDeviceCardLabels>;
  }>(),
  {
    service: () => new LoginCodeService(),
    labels: undefined,
  },
);

const emit = defineEmits<{
  approved: [result: LoginCodeApproval];
  cancel: [];
}>();

const copy = computed<AuthorizeDeviceCardLabels>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}));

const uid = useId();
const titleId = `authorize-device-title-${uid}`;
const passwordId = `authorize-device-password-${uid}`;

const capabilities = ref<LoginCodeCapabilities | null>(null);
const loading = ref(true);
const stage = ref<"idle" | "previewing" | "preview" | "approving" | "approved">(
  "idle",
);
const codeValue = ref("");
const password = ref("");
const previewResult = ref<LoginCodePreview | null>(null);
const codeError = ref<string | null>(null);
const formError = ref<string | null>(null);
const successMessage = ref<string | null>(null);

let capabilitiesController: AbortController | null = null;
let activeController: AbortController | null = null;

const available = computed(
  () =>
    !loading.value &&
    capabilities.value !== null &&
    capabilities.value.enabled &&
    capabilities.value.available,
);

const unavailable = computed(() => !loading.value && !available.value);

const busy = computed(
  () => stage.value === "previewing" || stage.value === "approving",
);

const requiresPassword = computed(
  () => capabilities.value?.approveRequiresPassword === true,
);

const codeLength = computed(() => {
  const length = capabilities.value?.codeLength;
  return typeof length === "number" && Number.isFinite(length) && length > 0
    ? length
    : 8;
});

const formDisabled = computed(
  () => !available.value || busy.value || stage.value === "approved",
);

const truncatedUserAgent = computed(() => {
  const value = previewResult.value?.userAgent ?? "";
  return value.length > 120 ? value.slice(0, 120) : value;
});

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

function errorCopy(code: LoginCodeErrorCode): string {
  switch (code) {
    case "INVALID_CODE":
      return copy.value.invalidCode;
    case "ALREADY_USED":
      return copy.value.alreadyUsed;
    case "RATE_LIMITED":
      return copy.value.rateLimited;
    case "PASSWORD_REQUIRED":
      return copy.value.passwordRequired;
    case "UNAUTHENTICATED":
      return copy.value.unauthenticated;
    case "FORBIDDEN":
      return copy.value.forbidden;
    case "NETWORK":
    case "TIMEOUT":
      return copy.value.network;
    default:
      return copy.value.generic;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function abortActive(): void {
  activeController?.abort();
  activeController = null;
}

function handleRequestError(
  caught: unknown,
  fromStage: "previewing" | "approving",
): void {
  const failure =
    caught instanceof LoginCodeError
      ? caught
      : new LoginCodeError("NETWORK", undefined, { retryable: true });
  const message = errorCopy(failure.code);

  const keepPreview =
    fromStage === "approving" &&
    previewResult.value !== null &&
    (failure.code === "PASSWORD_REQUIRED" ||
      failure.code === "RATE_LIMITED" ||
      failure.code === "NETWORK" ||
      failure.code === "TIMEOUT");

  if (keepPreview) {
    stage.value = "preview";
    formError.value = message;
    return;
  }

  stage.value = "idle";
  previewResult.value = null;
  successMessage.value = null;
  if (failure.code === "INVALID_CODE" || failure.code === "ALREADY_USED") {
    codeError.value = message;
    formError.value = null;
  } else {
    formError.value = message;
  }
}

async function submitCode(): Promise<void> {
  if (!available.value || busy.value || stage.value === "approved") return;

  const code = normalizeCode(codeValue.value);
  if (code.length !== codeLength.value) {
    codeError.value = copy.value.invalidCode;
    return;
  }

  abortActive();
  const controller = new AbortController();
  activeController = controller;
  stage.value = "previewing";
  codeError.value = null;
  formError.value = null;
  successMessage.value = null;

  try {
    const result = await props.service.preview(code, {
      signal: controller.signal,
    });
    if (activeController !== controller) return;
    previewResult.value = result;
    stage.value = "preview";
  } catch (caught) {
    if (activeController !== controller) return;
    handleRequestError(caught, "previewing");
  } finally {
    if (activeController === controller) activeController = null;
  }
}

async function approve(): Promise<void> {
  if (stage.value !== "preview" || !available.value) return;

  if (requiresPassword.value && password.value.trim().length === 0) {
    formError.value = copy.value.passwordRequired;
    return;
  }

  abortActive();
  const controller = new AbortController();
  activeController = controller;
  stage.value = "approving";
  formError.value = null;

  try {
    const result = await props.service.approve(
      { code: normalizeCode(codeValue.value), password: password.value || undefined },
      { signal: controller.signal },
    );
    if (activeController !== controller) return;
    successMessage.value = copy.value.approved;
    stage.value = "approved";
    password.value = "";
    emit("approved", result);
  } catch (caught) {
    if (activeController !== controller) return;
    handleRequestError(caught, "approving");
  } finally {
    if (activeController === controller) activeController = null;
  }
}

function reset(): void {
  abortActive();
  stage.value = "idle";
  codeValue.value = "";
  password.value = "";
  previewResult.value = null;
  codeError.value = null;
  formError.value = null;
  successMessage.value = null;
  emit("cancel");
}

watch(codeValue, () => {
  if (!previewResult.value && stage.value !== "approved") return;
  abortActive();
  stage.value = "idle";
  previewResult.value = null;
  codeError.value = null;
  formError.value = null;
  successMessage.value = null;
});

onMounted(async () => {
  const controller = new AbortController();
  capabilitiesController = controller;
  try {
    const result = await props.service.capabilities({
      signal: controller.signal,
    });
    if (capabilitiesController !== controller) return;
    capabilities.value = result;
  } catch {
    if (capabilitiesController !== controller) return;
    capabilities.value = null;
  } finally {
    if (capabilitiesController === controller) {
      capabilitiesController = null;
      loading.value = false;
    }
  }
});

onUnmounted(() => {
  capabilitiesController?.abort();
  capabilitiesController = null;
  abortActive();
});
</script>

<style scoped>
.authorize-device-card {
  max-width: 32rem;
  padding: clamp(var(--space-base, 1rem), 3vw, var(--space-xl, 2rem));
  color: var(--color-text, #171717);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-lg, 0.5rem);
  box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 10%));
}

.authorize-device-title {
  margin: 0 0 var(--space-sm, 0.5rem);
  font-size: var(--text-xl, 1.25rem);
  line-height: 1.3;
}

.authorize-device-warning {
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-on-warning, #fff);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
  background: var(--color-warning, #8a5a00);
  border-radius: var(--radius-sm, 0.25rem);
}

.authorize-device-preparing,
.authorize-device-unavailable {
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-text-muted, #5f6368);
}

.authorize-device-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 0.5rem);
}

.authorize-device-button {
  align-self: flex-start;
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  font: inherit;
  font-size: var(--text-sm, 0.875rem);
  border-radius: var(--radius-md, 0.375rem);
  cursor: pointer;
}

.authorize-device-button:focus-visible {
  outline: 3px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.authorize-device-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.authorize-device-button-primary {
  color: #fff;
  background: var(--color-primary, #c62828);
  border: 1px solid var(--color-primary, #c62828);
}

.authorize-device-button-primary:hover:not(:disabled) {
  background: var(--color-primary-hover, #a61f1f);
  border-color: var(--color-primary-hover, #a61f1f);
}

.authorize-device-button-secondary {
  color: var(--color-text, #171717);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-text-muted, #5f6368);
}

.authorize-device-error {
  margin: var(--space-sm, 0.5rem) 0;
  color: var(--color-error, #c62828);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
}

.authorize-device-preview {
  padding: var(--space-base, 1rem);
  margin-top: var(--space-base, 1rem);
  background: var(--color-surface-raised, #f5f5f5);
  border-radius: var(--radius-md, 0.375rem);
}

.authorize-device-sign-in {
  margin: 0 0 var(--space-sm, 0.5rem);
}

.authorize-device-details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-xs, 0.25rem) var(--space-base, 1rem);
  margin: 0 0 var(--space-base, 1rem);
  font-size: var(--text-sm, 0.875rem);
}

.authorize-device-details dt {
  color: var(--color-text-muted, #5f6368);
  font-weight: 600;
}

.authorize-device-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.authorize-device-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 0.25rem);
  margin-bottom: var(--space-base, 1rem);
}

.authorize-device-label {
  color: var(--color-text, #171717);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
}

.authorize-device-input {
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  color: var(--color-text, #171717);
  font: inherit;
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-md, 0.375rem);
}

.authorize-device-input:focus-visible {
  outline: 3px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.authorize-device-success {
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-success, #2e7d32);
  font-weight: 600;
}

.authorize-device-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm, 0.5rem);
}
</style>
