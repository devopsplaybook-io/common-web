<template>
  <section>
    <SettingsPage v-model:active-tab="activeTab" title="Settings" :tabs="tabs">
      <p v-if="activeTab === 'profile'">
        Per-user settings would render here through the panel slot.
      </p>
      <p v-else-if="activeTab === 'users'">
        Admin-only users management would render here.
      </p>
      <p v-else>Any other tab content renders in the same panel slot.</p>
    </SettingsPage>
  </section>
</template>

<script setup lang="ts">
import SettingsPage from "@devopsplaybook.io/common-web/components/SettingsPage.vue";

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "users", label: "Users" },
  { id: "statuses", label: "Statuses" },
];
const activeTab = ref("profile");
</script>
