<template>
  <div role="status" aria-live="polite" class="alert-messages">
    <div v-for="message in messages" :key="message.id">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { EventBus, EventTypes, type AlertMessage } from "../composables/EventBus";

interface DisplayMessage extends AlertMessage {
  id: number;
}

const DEFAULT_DURATION_MS = 5000;
const MAX_MESSAGES = 5;

const messages = ref<DisplayMessage[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

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

  if (message.durationMs === 0) return;
  const timer = setTimeout(() => {
    timers.delete(entry.id);
    dismiss(entry.id);
  }, message.durationMs ?? DEFAULT_DURATION_MS);
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
  padding: var(--space-base, 1rem);
  margin: var(--space-base, 1rem);
  color: var(--color-text-inverse, #fff);
  background-color: #546e7a;
}

.alert-message-text {
  flex: 1;
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
