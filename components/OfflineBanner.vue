<template>
  <div
    class="offline-banner"
    :class="{ 'offline-banner-hidden': isOnline }"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <template v-if="!isOnline"><slot>{{ message }}</slot></template>
  </div>
</template>

<script setup lang="ts">
import { useOfflineStatus } from "../composables/useOfflineStatus";

const { isOnline } = useOfflineStatus();

withDefaults(defineProps<{ message?: string }>(), {
  message: "You are offline.",
});
</script>

<style>
.offline-banner {
  --offline-banner-text: var(--color-on-warning, #fff);
  --offline-banner-surface: var(--color-warning, #8a5a00);

  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  color: var(--offline-banner-text);
  background: var(--offline-banner-surface);
  text-align: center;
}

@supports (color: light-dark(#000, #fff)) {
  .offline-banner {
    --offline-banner-text: var(--color-on-warning, light-dark(#fff, #171717));
    --offline-banner-surface: var(--color-warning, light-dark(#8a5a00, #f0b429));
  }
}

.offline-banner-hidden {
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
