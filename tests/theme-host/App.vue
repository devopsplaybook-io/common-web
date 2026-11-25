<template>
  <div class="theme-host">
    <section data-scenario="login-waiting">
      <LoginWithCodeCard :service="waitingService" />
    </section>

    <section data-scenario="login-plain">
      <LoginWithCodeCard
        :service="plainService"
        variant="plain"
        :heading-level="3"
      />
    </section>

    <section data-scenario="login-error">
      <LoginWithCodeCard :service="failingService" />
    </section>

    <section data-scenario="authorize-entry">
      <AuthorizeDeviceCard :service="entryService" />
    </section>

    <section data-scenario="authorize-preview">
      <AuthorizeDeviceCard :service="previewService" />
    </section>

    <section data-scenario="authorize-error">
      <AuthorizeDeviceCard :service="previewErrorService" />
    </section>

    <section data-scenario="input-normal">
      <LoginCodeInput v-model="normalCode" />
    </section>

    <section data-scenario="input-error">
      <LoginCodeInput
        v-model="errorCode"
        error="That code is invalid or has expired. Check the code and try again."
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import LoginCodeInput from "@devopsplaybook.io/common-web/components/LoginCodeInput.vue";
import { createStubService } from "./stub-service";

const waitingService = createStubService();
const plainService = createStubService();
const failingService = createStubService({ createFails: true });
const entryService = createStubService();
const previewService = createStubService();
const previewErrorService = createStubService({ previewFails: true });

const normalCode = ref("ABC123");
const errorCode = ref("ABC123");
</script>
