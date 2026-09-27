<template>
  <div
    class="loading-indicator"
    :class="{ 'loading-indicator-small': size === 'small' }"
    role="status"
    aria-live="polite"
    :aria-label="label"
  />
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: "small" | "large"; label?: string }>(), {
  size: "large",
  label: "Loading",
});
</script>

<style>
.loading-indicator {
  --loading-color: currentColor;
  --loading-gradient: no-repeat linear-gradient(var(--loading-color) 0 0);
  width: 15%;
  min-width: 2rem;
  margin: 20% auto;
  aspect-ratio: 1;
  background:
    var(--loading-gradient) 0% 50%,
    var(--loading-gradient) 50% 50%,
    var(--loading-gradient) 100% 50%;
  background-size: 20% 100%;
  animation: dpb-loading 2s infinite linear;
}

.loading-indicator-small {
  width: 3rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

@keyframes dpb-loading {
  0%,
  100% {
    background-size:
      20% 100%,
      20% 100%,
      20% 100%;
  }
  33% {
    background-size:
      20% 10%,
      20% 100%,
      20% 100%;
  }
  50% {
    background-size:
      20% 100%,
      20% 10%,
      20% 100%;
  }
  66% {
    background-size:
      20% 100%,
      20% 100%,
      20% 10%;
  }
}
</style>
