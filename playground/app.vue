<template>
  <div class="page-layout">
    <AppNavigation :links="links" :link-component="NuxtLink">
      <template #brand>
        <strong>Common Web Playground</strong>
      </template>
    </AppNavigation>
    <main>
      <NuxtPage />
      <AlertMessages class="page-alert-messages" />
    </main>
    <OfflineBanner />
  </div>
</template>

<script setup lang="ts">
import { resolveComponent } from "vue";

const NuxtLink = resolveComponent("NuxtLink");
const links = [{ label: "Home", to: "/" }];
useAppHeight();
</script>
