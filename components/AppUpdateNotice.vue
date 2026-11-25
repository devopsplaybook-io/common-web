<template>
  <div
    class="app-update-notice"
    :class="{ 'app-update-notice-hidden': !visible }"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="app-update-notice"
  >
    <template v-if="visible">
      <p class="app-update-notice-message" data-testid="app-update-message">
        {{ message }}
      </p>
      <div class="app-update-notice-actions">
        <button
          type="button"
          class="app-update-notice-button app-update-notice-reload"
          data-testid="app-update-reload"
          @click="emit('reload')"
        >
          {{ reloadLabel }}
        </button>
        <button
          type="button"
          class="app-update-notice-button app-update-notice-later"
          data-testid="app-update-later"
          @click="emit('later')"
        >
          {{ laterLabel }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    visible?: boolean;
    message?: string;
    reloadLabel?: string;
    laterLabel?: string;
  }>(),
  {
    visible: false,
    message: "New version available.",
    reloadLabel: "Reload",
    laterLabel: "Later",
  },
);

const emit = defineEmits<{ reload: []; later: [] }>();
</script>

<style>
.app-update-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm, 0.5rem);
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  color: var(--color-text, #171717);
  background: var(--color-surface-raised, #f5f5f5);
  border-top: 1px solid var(--color-border, #d6d6d6);
  font-size: var(--text-sm, 0.875rem);
}

.app-update-notice-message {
  margin: 0;
}

.app-update-notice-actions {
  display: flex;
  gap: var(--space-sm, 0.5rem);
}

.app-update-notice-button {
  font: inherit;
  padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
  color: inherit;
  background: transparent;
  border: 1px solid var(--color-border, #d6d6d6);
  border-radius: var(--radius-sm, 0.25rem);
  cursor: pointer;
}

.app-update-notice-reload {
  color: var(--color-on-primary, #fff);
  background: var(--color-primary, #c62828);
  border-color: var(--color-primary, #c62828);
}

.app-update-notice-button:focus-visible {
  outline: 2px solid var(--color-primary, #c62828);
  outline-offset: 2px;
}

.app-update-notice-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
