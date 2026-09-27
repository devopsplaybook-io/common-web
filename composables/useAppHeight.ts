import { onMounted, onUnmounted } from "vue";

export function useAppHeight(): void {
  function updateAppHeight(): void {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  }

  onMounted(() => {
    updateAppHeight();
    window.addEventListener("resize", updateAppHeight);
    window.visualViewport?.addEventListener("resize", updateAppHeight);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateAppHeight);
    window.visualViewport?.removeEventListener("resize", updateAppHeight);
  });
}
