import { onMounted, onUnmounted, ref } from "vue";

export function useOfflineStatus() {
  const isOnline = ref(true);

  function updateStatus(): void {
    isOnline.value = navigator.onLine;
  }

  onMounted(() => {
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
  });

  onUnmounted(() => {
    window.removeEventListener("online", updateStatus);
    window.removeEventListener("offline", updateStatus);
  });

  return { isOnline };
}
