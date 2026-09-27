<template>
  <div id="page-layout">
    <AppNavigation :links="links">
      <template #brand>
        <strong>Common Web Playground</strong>
      </template>
    </AppNavigation>
    <main>
      <NuxtPage />
      <AlertMessages id="page-alert-messages" />
    </main>
    <OfflineBanner />
  </div>
</template>

<script setup lang="ts">
const links = [{ label: "Home", to: "/" }];
useAppHeight();
</script>
