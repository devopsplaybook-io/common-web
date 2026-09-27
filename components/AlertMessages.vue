<template>
  <div role="status" aria-live="polite" class="alert-messages">
    <div v-for="message in messages" :key="message.id">
      <div
        :class="message.type ? `message message-${message.type}` : 'message'"
      >
        <span class="message-text">
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

const messages = ref<DisplayMessage[]>([]);
const timers = new Set<ReturnType<typeof setTimeout>>();
let nextId = 1;

function dismiss(id: number): void {
  const index = messages.value.findIndex((message) => message.id === id);
  if (index !== -1) messages.value.splice(index, 1);
}

function handleAlert(message: AlertMessage): void {
  const entry = { ...message, id: nextId++ };
  messages.value.push(entry);
  const timer = setTimeout(() => {
    timers.delete(timer);
    dismiss(entry.id);
  }, message.durationMs || 5000);
  timers.add(timer);
}

onMounted(() => EventBus.on(EventTypes.ALERT_MESSAGE, handleAlert));
onUnmounted(() => {
  EventBus.off(EventTypes.ALERT_MESSAGE, handleAlert);
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
});
</script>

<style>
.message {
  display: flex;
  align-items: center;
  padding: var(--space-base, 1rem);
  margin: var(--space-base, 1rem);
  color: var(--color-text-inverse, #fff);
  background-color: #546e7a;
}

.message-text {
  flex: 1;
}

.message-info,
.message-success {
  background-color: var(--color-success, #2e7d32);
}

.message-warning {
  background-color: var(--color-warning, #8a5a00);
}

.message-error {
  background-color: var(--color-error, #c62828);
}
</style>
