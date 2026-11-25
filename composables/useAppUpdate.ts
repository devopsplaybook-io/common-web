import { onMounted, onUnmounted, ref, type Ref } from "vue";
import { AppUpdateService } from "../services/AppUpdateService";

export interface UseAppUpdateOptions {
  currentBuildId?: string | null;
  fetchLatestBuildId: () => Promise<string | null>;
  intervalMs?: number;
  /** Start polling on mount; defaults to `true`. */
  autoStart?: boolean;
  /** Runs before a reload; rejecting it vetoes the reload. */
  beforeReload?: () => void | Promise<void>;
  /** Defaults to `window.location.reload()`. */
  reload?: () => void;
}

export interface UseAppUpdate {
  updateAvailable: Ref<boolean>;
  dismissed: Ref<boolean>;
  latestBuildId: Ref<string | null>;
  checkNow: () => Promise<void>;
  start: () => () => void;
  stop: () => void;
  reload: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Vue wrapper around {@link AppUpdateService}. Browser APIs are touched only
 * after mount, so the composable is safe to call during SSR.
 */
export function useAppUpdate(options: UseAppUpdateOptions): UseAppUpdate {
  const updateAvailable = ref(false);
  const dismissed = ref(false);
  const latestBuildId = ref<string | null>(null);

  const service = new AppUpdateService({
    currentBuildId: options.currentBuildId,
    fetchLatestBuildId: options.fetchLatestBuildId,
    intervalMs: options.intervalMs,
    onUpdateAvailable: (latest) => {
      updateAvailable.value = true;
      latestBuildId.value = latest;
      dismissed.value = false;
    },
  });

  let stopFn: (() => void) | null = null;
  let reloadPromise: Promise<void> | null = null;

  function syncFromService(): void {
    updateAvailable.value = service.updateAvailable;
    latestBuildId.value = service.latestBuildId;
  }

  async function checkNow(): Promise<void> {
    await service.checkNow();
    syncFromService();
  }

  function start(): () => void {
    stopFn = service.start();
    return stopFn;
  }

  function stop(): void {
    const fn = stopFn;
    stopFn = null;
    fn?.();
    updateAvailable.value = false;
    dismissed.value = false;
    latestBuildId.value = null;
  }

  function dismiss(): void {
    service.dismiss();
    updateAvailable.value = false;
    dismissed.value = true;
  }

  function reload(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (reloadPromise) return reloadPromise;

    const reloadImpl =
      options.reload ??
      ((): void => {
        if (typeof window !== "undefined") window.location.reload();
      });

    reloadPromise = (async () => {
      try {
        await options.beforeReload?.();
      } catch {
        return;
      }
      reloadImpl();
    })();
    return reloadPromise;
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") void checkNow();
  }

  function onOnlineOrFocus(): void {
    void checkNow();
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnlineOrFocus);
    window.addEventListener("focus", onOnlineOrFocus);
    if (options.autoStart !== false) start();
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", onOnlineOrFocus);
    window.removeEventListener("focus", onOnlineOrFocus);
    stop();
  });

  return {
    updateAvailable,
    dismissed,
    latestBuildId,
    checkNow,
    start,
    stop,
    reload,
    dismiss,
  };
}
