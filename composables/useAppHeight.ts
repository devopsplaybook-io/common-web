import { onMounted, onUnmounted } from "vue";

let frame: number | null = null;
let mountedConsumers = 0;

export function useAppHeight(): void {
  function updateAppHeight(): void {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  }

  function scheduleAppHeight(): void {
    if (frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      frame = requestAnimationFrame(() => {
        frame = null;
        updateAppHeight();
      });
    } else {
      updateAppHeight();
    }
  }

  onMounted(() => {
    mountedConsumers += 1;
    updateAppHeight();
    window.addEventListener("resize", scheduleAppHeight);
    window.visualViewport?.addEventListener("resize", scheduleAppHeight);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", scheduleAppHeight);
    window.visualViewport?.removeEventListener("resize", scheduleAppHeight);
    mountedConsumers = Math.max(0, mountedConsumers - 1);
    // Another instance may still use the shared pending frame.
    if (mountedConsumers === 0 && frame !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
      frame = null;
    }
  });
}
