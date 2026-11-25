<template>
  <section>
    <h1>Login with code</h1>
    <p>
      This page uses the layer's auto-imported <code>LoginCodeInput</code>,
      <code>LoginWithCodeCard</code> and <code>AuthorizeDeviceCard</code>. The
      stub service reports the feature as disabled, so no backend is required.
    </p>
    <LoginCodeInput v-model="code" />
    <LoginWithCodeCard :service="disabledService" :auto-start="false" />
    <AuthorizeDeviceCard :service="disabledService" />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { LoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";

const code = ref("");

const disabledService = {
  capabilities: async () => ({
    enabled: false,
    available: false,
    codeLength: 8,
    rotationSeconds: 30,
    graceSeconds: 60,
    ttlSeconds: 300,
    pollIntervalMs: 2000,
    approveRequiresPassword: false,
    serverTime: new Date().toISOString(),
  }),
} as unknown as LoginCodeService;
</script>
