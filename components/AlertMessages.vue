<template>
  <div class="alert-messages">
    <div
      v-for="region in regions"
      :key="region.role"
      :role="region.role"
      :aria-live="region.live"
      aria-atomic="false"
    >
      <div v-for="message in region.messages" :key="message.id">
        <div
          :class="
            message.type
              ? `alert-message alert-message-${message.type}`
              : 'alert-message'
          "
        >
          <span class="alert-message-text">
            <b v-if="message.type">{{ message.type }}</b>
            {{ message.text }}
          </span>
          <button
            type="button"
            class="alert-message-dismiss"
            aria-label="Dismiss"
            @click="dismiss(message.id)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { EventBus, EventTypes, type AlertMessage } from "../composables/EventBus";

interface DisplayMessage extends AlertMessage {
  id: number;
}

interface AlertRegion {
  role: "status" | "alert";
  live: "polite" | "assertive";
  messages: DisplayMessage[];
}

const DEFAULT_DURATION_MS = 5000;
const MAX_MESSAGES = 5;

const messages = ref<DisplayMessage[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

const regions = computed<AlertRegion[]>(() => [
  {
    role: "status",
    live: "polite",
    messages: messages.value.filter((message) => message.type !== "error"),
  },
  {
    role: "alert",
    live: "assertive",
    messages: messages.value.filter((message) => message.type === "error"),
  },
]);

function normalizeDuration(durationMs: number | undefined): number {
  if (durationMs === undefined) return DEFAULT_DURATION_MS;
  if (!Number.isFinite(durationMs)) return DEFAULT_DURATION_MS;
  return Math.max(0, Math.floor(durationMs));
}

function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const index = messages.value.findIndex((message) => message.id === id);
  if (index !== -1) messages.value.splice(index, 1);
}

function handleAlert(message: AlertMessage): void {
  const duplicate = messages.value.some(
    (existing) => existing.type === message.type && existing.text === message.text,
  );
  if (duplicate) return;

  const entry = { ...message, id: nextId++ };
  messages.value.push(entry);
  while (messages.value.length > MAX_MESSAGES) {
    const oldest = messages.value[0];
    if (oldest) dismiss(oldest.id);
  }

  const duration = normalizeDuration(message.durationMs);
  if (duration === 0) return;
  const timer = setTimeout(() => {
    timers.delete(entry.id);
    dismiss(entry.id);
  }, duration);
  timers.set(entry.id, timer);
}

onMounted(() => EventBus.on(EventTypes.ALERT_MESSAGE, handleAlert));
onUnmounted(() => {
  EventBus.off(EventTypes.ALERT_MESSAGE, handleAlert);
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
});
</script>

<style>
.alert-message {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 0.5rem);
  padding: var(--space-base, 1rem);
  margin: var(--space-base, 1rem);
  color: var(--color-text-inverse, #fff);
  background-color: #546e7a;
}

.alert-message-text {
  flex: 1;
}

.alert-message-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 1.75rem;
  min-height: 1.75rem;
  padding: 0;
  color: inherit;
  font: inherit;
  font-size: 1.25rem;
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm, 0.25rem);
  cursor: pointer;
}

.alert-message-dismiss:hover {
  background: rgb(255 255 255 / 20%);
}

.alert-message-dismiss:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.alert-message-info,
.alert-message-success {
  background-color: var(--color-success, #2e7d32);
  color: var(--color-on-success, #fff);
}

.alert-message-warning {
  background-color: var(--color-warning, #8a5a00);
  color: var(--color-on-warning, #fff);
}

.alert-message-error {
  background-color: var(--color-error, #c62828);
  color: var(--color-on-error, #fff);
}
</style>
