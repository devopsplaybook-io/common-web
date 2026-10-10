<template>
  <div class="settings-page">
    <header class="settings-page-header">
      <h1 class="settings-page-title">
        <slot name="title">{{ title }}</slot>
      </h1>
      <div v-if="tabs.length > 0" class="settings-page-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :id="`${panelId}-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          class="settings-page-tab"
          :class="{ 'settings-page-tab-active': tab.id === activeTab }"
          role="tab"
          :aria-selected="tab.id === activeTab"
          :aria-controls="panelId"
          @click="selectTab(tab.id)"
        >
          <span v-if="tab.icon" :class="tab.icon" aria-hidden="true" />
          {{ tab.label }}
        </button>
      </div>
    </header>
    <div
      :id="panelId"
      class="settings-page-panel"
      role="tabpanel"
      :aria-labelledby="`${panelId}-tab-${activeTab}`"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";

interface SettingsPageTab {
  id: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  title?: string;
  tabs: SettingsPageTab[];
  activeTab: string;
}>();

const emit = defineEmits<{ "update:activeTab": [tabId: string] }>();

const panelId = useId();

function selectTab(tabId: string) {
  if (tabId !== props.activeTab) {
    emit("update:activeTab", tabId);
  }
}
</script>

<style>
.settings-page {
  display: grid;
  gap: var(--space-lg, 1.5rem);
  align-content: start;
  color: var(--color-text, inherit);
}

.settings-page-header {
  display: grid;
  gap: var(--space-base, 1rem);
}

.settings-page-title {
  margin: 0;
  font-size: var(--text-2xl, 1.5rem);
}

.settings-page-tabs {
  display: flex;
  gap: var(--space-xs, 0.25rem);
  border-bottom: 1px solid var(--color-border, #d6d6d6);
}

.settings-page-tab {
  padding: var(--space-sm, 0.5rem) var(--space-md, 1.25rem);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  margin-bottom: -1px;
  background: none;
  color: var(--color-text-muted, #5f6368);
  font: inherit;
  cursor: pointer;
}

.settings-page-tab:hover {
  color: var(--color-primary, #c62828);
}

.settings-page-tab-active {
  color: var(--color-primary, #c62828);
  border-bottom-color: var(--color-primary, #c62828);
}

.settings-page-panel {
  min-width: 0;
}
</style>
