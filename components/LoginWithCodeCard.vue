<template>
  <section class="login-with-code-card" :aria-labelledby="titleId">
    <h2 :id="titleId" class="login-with-code-title">{{ copy.title }}</h2>
    <p class="login-with-code-instructions">{{ copy.instructions }}</p>

    <template v-if="!unavailable">
      <div v-if="showCode" class="login-with-code-display">
        <p class="login-with-code-label" aria-hidden="true">
          {{ copy.codeLabel }}
        </p>
        <code class="login-with-code-value" aria-hidden="true">
          {{ loginCode.formattedCode.value }}
        </code>
        <span class="login-with-code-sr-only">{{ spelledCode }}</span>
        <button
          type="button"
          class="login-with-code-copy"
          @click="copyCode"
        >
          {{ copied ? copy.copied : copy.copy }}
        </button>
      </div>

      <p v-if="showCountdowns" class="login-with-code-countdown">
        <span v-if="refreshText">{{ refreshText }}</span>
        <span v-if="refreshText && expiryText" aria-hidden="true"> · </span>
        <span v-if="expiryText">{{ expiryText }}</span>
      </p>
    </template>

    <p
      :id="statusId"
      class="login-with-code-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ statusText }}
    </p>

    <div class="login-with-code-actions">
      <button
        v-if="canCancel"
        type="button"
        class="login-with-code-button login-with-code-button-secondary"
        @click="handleCancel"
      >
        {{ copy.cancel }}
      </button>
      <button
        v-if="canRetry"
        type="button"
        class="login-with-code-button login-with-code-button-primary"
        @click="handleRetry"
      >
        {{ copy.retry }}
      </button>
      <button
        type="button"
        class="login-with-code-button login-with-code-button-link"
        @click="emitUsePassword"
      >
        {{ copy.usePassword }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from "vue";
import { useLoginCode } from "../composables/useLoginCode";
import type { LoginCodeService } from "../services/LoginCodeService";

interface LoginWithCodeCardLabels {
  title: string;
  instructions: string;
  codeLabel: string;
  preparing: string;
  waiting: string;
  approved: string;
  expired: string;
  cancelled: string;
  error: string;
  unavailable: string;
  refreshIn: string;
  expiresIn: string;
  copy: string;
  copied: string;
  cancel: string;
  usePassword: string;
  retry: string;
}

const DEFAULT_LABELS: LoginWithCodeCardLabels = {
  title: "Sign in with a code",
  instructions:
    "Enter this code on a device where you are already signed in, or scan the flow from that device.",
  codeLabel: "Login code",
  preparing: "Preparing a code…",
  waiting: "Waiting for approval",
  approved: "Approved",
  expired: "Code expired",
  cancelled: "Login cancelled",
  error: "Something went wrong",
  unavailable: "Login with a code is unavailable. Use your password instead.",
  refreshIn: "New code in {seconds}s",
  expiresIn: "Expires in {seconds}s",
  copy: "Copy code",
  copied: "Copied",
  cancel: "Cancel",
  usePassword: "Use password instead",
  retry: "Try again",
};

const props = withDefaults(
  defineProps<{
    service?: LoginCodeService;
    onSession?: (token: string, user: unknown) => void | Promise<void>;
    autoStart?: boolean;
    labels?: Partial<LoginWithCodeCardLabels>;
  }>(),
  {
    service: undefined,
    onSession: undefined,
    autoStart: true,
    labels: undefined,
  },
);

const emit = defineEmits<{
  approved: [payload: { token: string; user: unknown }];
  cancel: [];
  "use-password": [];
}>();

const copy = computed<LoginWithCodeCardLabels>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}));

const loginCode = useLoginCode({
  service: props.service,
  onSession: handleSession,
});

const uid = useId();
const titleId = `login-with-code-title-${uid}`;
const statusId = `login-with-code-status-${uid}`;

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const unavailable = computed(() => {
  if (loginCode.error.value?.code === "LOGIN_CODE_UNAVAILABLE") return true;
  const capabilities = loginCode.capabilities.value;
  return (
    capabilities !== null && (!capabilities.enabled || !capabilities.available)
  );
});

const showCode = computed(
  () => !unavailable.value && loginCode.code.value !== null,
);

const showCountdowns = computed(
  () => loginCode.status.value === "waiting" && !unavailable.value,
);

const canCancel = computed(
  () =>
    loginCode.status.value === "creating" ||
    loginCode.status.value === "waiting",
);

const canRetry = computed(() => {
  const status = loginCode.status.value;
  return (
    !unavailable.value &&
    (status === "error" || status === "expired" || status === "cancelled")
  );
});

const statusText = computed(() => {
  if (unavailable.value) return copy.value.unavailable;
  switch (loginCode.status.value) {
    case "approved":
      return copy.value.approved;
    case "expired":
      return copy.value.expired;
    case "cancelled":
      return copy.value.cancelled;
    case "error":
      return copy.value.error;
    case "waiting":
      return copy.value.waiting;
    default:
      return copy.value.preparing;
  }
});

const refreshText = computed(() =>
  formatSeconds(copy.value.refreshIn, loginCode.secondsUntilRefresh.value),
);

const expiryText = computed(() =>
  formatSeconds(copy.value.expiresIn, loginCode.secondsUntilExpiry.value),
);

const spelledCode = computed(() => {
  const value = loginCode.code.value;
  if (!value) return "";
  return `${copy.value.codeLabel}: ${value.split("").join(" ")}`;
});

function formatSeconds(template: string, seconds: number | null): string | null {
  if (seconds === null) return null;
  return template.replace("{seconds}", String(seconds));
}

async function handleSession(token: string, user: unknown): Promise<void> {
  try {
    await props.onSession?.(token, user);
  } finally {
    emit("approved", { token, user });
  }
}

async function copyCode(): Promise<void> {
  const value = loginCode.code.value;
  if (!value) return;
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return;

  try {
    await clipboard.writeText(value);
  } catch {
    return;
  }
  copied.value = true;
  if (copyTimer !== null) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyTimer = null;
    copied.value = false;
  }, 2000);
}

async function handleCancel(): Promise<void> {
  await loginCode.cancel();
  emit("cancel");
}

function handleRetry(): void {
  void loginCode.retry();
}

function emitUsePassword(): void {
  emit("use-password");
}

onMounted(() => {
  if (props.autoStart) void loginCode.start();
});

onUnmounted(() => {
  if (copyTimer !== null) {
    clearTimeout(copyTimer);
    copyTimer = null;
  }
});
</script>

<style scoped>
.login-with-code-card {
  max-width: 30rem;
  padding: clamp(var(--space-base, 1rem), 3vw, var(--space-xl, 2rem));
  color: var(--color-text, #171717);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-lg, 0.5rem);
  box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 10%));
}

.login-with-code-title {
  margin: 0 0 var(--space-sm, 0.5rem);
  font-size: var(--text-xl, 1.25rem);
  line-height: 1.3;
}

.login-with-code-instructions {
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-text-muted, #5f6368);
  font-size: var(--text-sm, 0.875rem);
}

.login-with-code-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm, 0.5rem);
  padding: var(--space-base, 1rem);
  margin-bottom: var(--space-base, 1rem);
  background: var(--color-surface-raised, #f5f5f5);
  border-radius: var(--radius-md, 0.375rem);
}

.login-with-code-label {
  margin: 0;
  color: var(--color-text-muted, #5f6368);
  font-size: var(--text-sm, 0.875rem);
}

.login-with-code-value {
  color: var(--color-text, #171717);
  font-family: ui-monospace, "SFMono-Regular", "Consolas", monospace;
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  line-height: 1.2;
  white-space: nowrap;
}

.login-with-code-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.login-with-code-copy {
  padding: var(--space-xs, 0.25rem) var(--space-base, 1rem);
  color: var(--color-text, #171717);
  font: inherit;
  font-size: var(--text-sm, 0.875rem);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-sm, 0.25rem);
  cursor: pointer;
}

.login-with-code-copy:focus-visible {
  outline: 3px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.login-with-code-countdown {
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-text-muted, #5f6368);
  font-size: var(--text-sm, 0.875rem);
  text-align: center;
}

.login-with-code-status {
  margin: 0 0 var(--space-base, 1rem);
  color: var(--color-text, #171717);
  font-weight: 600;
}

.login-with-code-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm, 0.5rem);
  align-items: center;
}

.login-with-code-button {
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  font: inherit;
  font-size: var(--text-sm, 0.875rem);
  border-radius: var(--radius-md, 0.375rem);
  cursor: pointer;
}

.login-with-code-button:focus-visible {
  outline: 3px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.login-with-code-button-primary {
  color: #fff;
  background: var(--color-primary, #c62828);
  border: 1px solid var(--color-primary, #c62828);
}

.login-with-code-button-primary:hover {
  background: var(--color-primary-hover, #a61f1f);
  border-color: var(--color-primary-hover, #a61f1f);
}

.login-with-code-button-secondary {
  color: var(--color-text, #171717);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-text-muted, #5f6368);
}

.login-with-code-button-link {
  padding-right: var(--space-xs, 0.25rem);
  padding-left: var(--space-xs, 0.25rem);
  color: var(--color-primary, #c62828);
  background: transparent;
  border: 1px solid transparent;
  text-decoration: underline;
}
</style>
