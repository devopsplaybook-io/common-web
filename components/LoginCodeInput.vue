<template>
  <div class="login-code-input">
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
.login-code-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 0.25rem);
  margin-bottom: var(--space-base, 1rem);
}

.login-code-input-label {
  color: var(--color-text, #171717);
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
}

.login-code-input-field {
  width: 100%;
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  color: var(--color-text, #171717);
  font-family: ui-monospace, "SFMono-Regular", "Consolas", monospace;
  font-size: var(--text-xl, 1.25rem);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-md, 0.375rem);
}

.login-code-input-field:focus-visible {
  outline: 3px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.login-code-input-field-invalid {
  border-color: var(--color-error, #c62828);
}

.login-code-input-field:disabled {
  color: var(--color-text-muted, #5f6368);
  background: var(--color-surface-raised, #f5f5f5);
  cursor: not-allowed;
}

.login-code-input-error {
  margin: 0;
  color: var(--color-error, #c62828);
  font-size: var(--text-sm, 0.875rem);
}
</style>
