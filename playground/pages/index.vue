<template>
  <section>
    <h1>Shared web layer</h1>
    <p>
      This page demonstrates auto-imported components, theme tokens, and the
      app-local Loading override.
    </p>
    <Loading />
    <button type="button" @click="toggleTheme">
      Switch to {{ isDark ? "light" : "dark" }} theme
    </button>
    <button type="button" @click="showAlert">Show alert</button>
    <p><NuxtLink to="/deep">Open the deep-import example</NuxtLink></p>
  </section>
</template>

<script setup lang="ts">
const { isDark, toggleTheme } = useTheme();

function showAlert(): void {
  EventBus.emit(EventTypes.ALERT_MESSAGE, {
    type: "info",
    text: "The shared alert component is active.",
  });
}
</script>
