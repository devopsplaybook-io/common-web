import { onMounted, onUnmounted } from "vue";

let frame: number | null = null;

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
    updateAppHeight();
    window.addEventListener("resize", scheduleAppHeight);
    window.visualViewport?.addEventListener("resize", scheduleAppHeight);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", scheduleAppHeight);
    window.visualViewport?.removeEventListener("resize", scheduleAppHeight);
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  });
}
