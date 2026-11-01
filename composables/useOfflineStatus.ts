import { onMounted, onUnmounted, ref } from "vue";

export function useOfflineStatus() {
  // Always start online so server HTML and the first client render agree;
  // the real value is read after mount to avoid a hydration mismatch.
  const isOnline = ref(true);

  function updateStatus(): void {
    if (typeof navigator === "undefined") return;
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
