<template>
  <nav class="app-navigation" :aria-label="label">
    <div class="app-navigation-brand">
      <slot name="brand" />
    </div>
    <ul class="app-navigation-links">
      <li v-for="(link, index) in links" :key="`${link.to}::${index}`">
        <component
          :is="linkComponent"
          v-bind="linkProps(link)"
          :aria-current="link.active ? 'page' : undefined"
        >
          <span v-if="link.icon" :class="link.icon" aria-hidden="true" />
          {{ link.label }}
        </component>
      </li>
    </ul>
    <slot />
  </nav>
</template>

<script setup lang="ts">
import { watch, type Component } from "vue";

interface AppNavigationLink {
  label: string;
  to: string;
  icon?: string;
  active?: boolean;
}

const props = withDefaults(
  defineProps<{
    links: AppNavigationLink[];
    linkComponent?: string | Component;
    label?: string;
  }>(),
  { linkComponent: "a", label: "Main navigation" },
);

watch(
  () => props.links,
  (links) => {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
      return;
    }
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.to)) {
        console.warn(
          `[AppNavigation] duplicate link target "${link.to}"; links are keyed by target and position.`,
        );
      }
      seen.add(link.to);
    }
  },
  { immediate: true, deep: true },
);

function linkProps(link: AppNavigationLink): { href: string } | { to: string } {
  return props.linkComponent === "a" ? { href: link.to } : { to: link.to };
}
</script>

<style>
.app-navigation {
  display: flex;
  align-items: center;
  gap: var(--space-base, 1rem);
  min-height: var(--header-height, 4rem);
  padding-inline: var(--space-base, 1rem);
  color: var(--color-text, inherit);
  background: var(--color-surface, transparent);
}

.app-navigation-brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.app-navigation-links {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 0.5rem);
  padding: 0;
  margin: 0;
  list-style: none;
}

.app-navigation a {
  color: inherit;
  text-decoration: none;
}
</style>
