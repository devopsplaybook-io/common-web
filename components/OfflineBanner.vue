<template>
  <div v-if="!isOnline" class="offline-banner" role="status" aria-live="polite">
    <slot>You are offline — showing cached data</slot>
  </div>
</template>

<script setup lang="ts">
import { useOfflineStatus } from "../composables/useOfflineStatus";

const { isOnline } = useOfflineStatus();
</script>

<style>
.offline-banner {
  padding: var(--space-sm, 0.5rem) var(--space-base, 1rem);
  color: var(--color-text-inverse, #fff);
  background: var(--color-warning, #8a5a00);
  text-align: center;
}
</style>
