<template>
  <div class="login-code-input lc-theme">
    <label class="login-code-input-label" :for="inputId">{{ label }}</label>
    <input
      :id="inputId"
      class="login-code-input-field"
      :class="{ 'login-code-input-field-invalid': Boolean(error) }"
      type="text"
      :value="modelValue"
      :maxlength="length"
      autocomplete="off"
      spellcheck="false"
      autocapitalize="characters"
      inputmode="text"
      :disabled="disabled"
      :aria-label="accessibleName"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      @input="onInput"
      @paste.prevent="onPaste"
      @keydown.enter.prevent="onEnter"
    />
    <p v-if="error" :id="errorId" class="login-code-input-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    length?: number;
    id?: string;
  }>(),
  {
    label: "Login code",
    error: undefined,
    disabled: false,
    length: 8,
    id: undefined,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

const generatedId = useId();
const inputId = computed(() => props.id ?? generatedId);
const errorId = computed(() => `${inputId.value}-error`);

const accessibleName = computed(() => {
  if (!props.modelValue) return props.label;
  const spelled = props.modelValue.split("").join(" ");
  return `${props.label}: ${spelled}`;
});

function normalize(value: string): string {
  return value
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .slice(0, props.length);
}

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const normalized = normalize(target.value);
  // Keep the DOM in sync when the normalized value equals the current model
  // (for example a rejected digit), where Vue would skip the re-render.
  if (target.value !== normalized) target.value = normalized;
  emit("update:modelValue", normalized);
}

function onPaste(event: ClipboardEvent): void {
  const target = event.target as HTMLInputElement;
  const text = event.clipboardData?.getData("text") ?? "";
  const normalized = normalize(`${target.value}${text}`);
  target.value = normalized;
  emit("update:modelValue", normalized);
}

function onEnter(): void {
  if (normalize(props.modelValue).length === props.length) emit("submit");
}
</script>

<style scoped>
/* Internal theme layer: host tokens win, theme-aware fallbacks otherwise. */
.lc-theme {
  --lc-space-xs: var(--space-xs, 0.25rem);
  --lc-space-sm: var(--space-sm, 0.5rem);
  --lc-space: var(--space-base, var(--space-md, 1rem));
  --lc-space-lg: var(--space-lg, 1.5rem);
  --lc-space-xl: var(--space-xl, 2rem);

  --lc-surface: var(--color-surface, #fff);
  --lc-raised: var(--color-surface-raised, #f5f5f5);
  --lc-text: var(--color-text, #171717);
  --lc-muted: var(--color-text-muted, #5f6368);
  --lc-border: var(--color-border, #d6d6d6);
  --lc-primary: var(--color-primary, #c62828);
  --lc-primary-hover: var(--color-primary-hover, #a61f1f);
  --lc-on-primary: var(--color-on-primary, #fff);
  --lc-warning: var(--color-warning, #8a5a00);
  --lc-danger: var(--color-error, var(--color-danger, #b3261e));
  --lc-success: var(--color-success, #2e7d32);
}

@supports (background: color-mix(in srgb, red, blue)) {
  .lc-theme {
    --lc-raised: var(--color-surface-raised,
      color-mix(in srgb, var(--lc-text) 5%, var(--lc-surface)));
    --lc-warning-bg: color-mix(in srgb, var(--lc-warning) 14%, var(--lc-surface));
    --lc-danger-bg: color-mix(in srgb, var(--lc-danger) 12%, var(--lc-surface));
  }
}

@supports (color: light-dark(#000, #fff)) {
  .lc-theme {
    --lc-surface: var(--color-surface, light-dark(#fff, #1b242c));
    --lc-text: var(--color-text, light-dark(#171717, #d7dee4));
    --lc-muted: var(--color-text-muted, light-dark(#5f6368, #8a99a6));
    --lc-border: var(--color-border, light-dark(#d6d6d6, #2e3a44));
    --lc-primary: var(--color-primary, light-dark(#c62828, #ff8a80));
    --lc-primary-hover: var(--color-primary-hover, light-dark(#a61f1f, #ffb4ab));
    --lc-on-primary: var(--color-on-primary, light-dark(#fff, #171717));
    --lc-warning: var(--color-warning, light-dark(#8a5a00, #f0b429));
    --lc-danger: var(--color-error, var(--color-danger, light-dark(#b3261e, #ff8a80)));
    --lc-success: var(--color-success, light-dark(#2e7d32, #66bb6a));
  }
}

.login-code-input {
  display: flex;
  flex-direction: column;
  gap: var(--lc-space-xs);
  margin-bottom: var(--lc-space);
}

.login-code-input-label {
  color: var(--lc-text);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
}

.login-code-input-field {
  width: 100%;
  padding: var(--lc-space-sm) var(--lc-space);
  color: var(--lc-text);
  font-family: ui-monospace, "SFMono-Regular", "Consolas", monospace;
  font-size: var(--text-xl, 1.25rem);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  background: var(--lc-surface);
  border: 2px solid var(--lc-border);
  border-radius: var(--radius-md, 0.375rem);
}

.login-code-input-field:focus-visible {
  outline: 2px solid var(--lc-primary);
  outline-offset: 2px;
}

.login-code-input-field-invalid {
  border-color: var(--lc-danger);
}

.login-code-input-field:disabled {
  color: var(--lc-muted);
  background: var(--lc-raised);
  cursor: not-allowed;
}

.login-code-input-error {
  margin: 0;
  color: var(--lc-danger);
  font-size: var(--text-sm, 0.875rem);
}
</style>
