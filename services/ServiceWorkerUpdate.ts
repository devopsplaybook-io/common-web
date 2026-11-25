export const DEFAULT_SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;
export const SW_UPDATE_TIMEOUT_MS = 10_000;

export interface AcceptServiceWorkerUpdateOptions {
  registration?: ServiceWorkerRegistration | null;
  message?: unknown;
  reload?: () => void;
  timeoutMs?: number;
}

function sanitizeTimeout(timeoutMs: number | undefined): number {
  return typeof timeoutMs === "number" &&
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
    ? timeoutMs
    : SW_UPDATE_TIMEOUT_MS;
}

function defaultReload(): void {
  if (typeof window !== "undefined") window.location.reload();
}

/**
 * Activate an installed waiting service worker: post `SKIP_WAITING`, wait for
 * `controllerchange`, then reload. Falls back to a plain reload when there is
 * no waiting worker or after the timeout. Reload happens exactly once.
 */
export function acceptServiceWorkerUpdate(
  options: AcceptServiceWorkerUpdateOptions = {},
): Promise<void> {
  return new Promise<void>((resolve) => {
    const reload = options.reload ?? defaultReload;
    const timeoutMs = sanitizeTimeout(options.timeoutMs);
    const container =
      typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    const waiting = options.registration?.waiting ?? null;

    let done = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onControllerChange = (): void => finish();

    function finish(): void {
      if (done) return;
      done = true;
      if (timeout !== undefined) clearTimeout(timeout);
      container?.removeEventListener("controllerchange", onControllerChange);
      reload();
      resolve();
    }

    if (!container || !waiting) {
      finish();
      return;
    }

    try {
      container.addEventListener("controllerchange", onControllerChange);
      waiting.postMessage(options.message ?? DEFAULT_SKIP_WAITING_MESSAGE);
    } catch {
      finish();
      return;
    }

    timeout = setTimeout(finish, timeoutMs);
  });
}
