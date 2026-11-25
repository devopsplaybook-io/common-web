export const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface AppUpdateServiceOptions {
  currentBuildId?: string | null;
  fetchLatestBuildId: () => Promise<string | null>;
  intervalMs?: number;
  isDocumentHidden?: () => boolean;
  onUpdateAvailable?: (latestBuildId: string) => void;
}

function defaultIsDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function sanitizeInterval(intervalMs: number | undefined): number {
  return typeof intervalMs === "number" &&
    Number.isFinite(intervalMs) &&
    intervalMs > 0
    ? intervalMs
    : APP_UPDATE_CHECK_INTERVAL_MS;
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Framework-agnostic build-update checker. It compares the running build id
 * with the latest deployed one on a schedule and exposes a single availability
 * flag. Browser globals are read lazily so the module imports cleanly in Node.
 */
export class AppUpdateService {
  private readonly currentBuildId: string | null;
  private readonly fetchLatestBuildId: () => Promise<string | null>;
  private readonly intervalMs: number;
  private readonly isDocumentHidden: () => boolean;
  private readonly onUpdateAvailable?: (latestBuildId: string) => void;

  private available = false;
  private latest: string | null = null;
  private dismissedBuildId: string | null = null;
  private inFlight: Promise<void> | null = null;
  private stopFn: (() => void) | null = null;

  constructor(options: AppUpdateServiceOptions) {
    this.currentBuildId = options.currentBuildId ?? null;
    this.fetchLatestBuildId = options.fetchLatestBuildId;
    this.intervalMs = sanitizeInterval(options.intervalMs);
    this.isDocumentHidden = options.isDocumentHidden ?? defaultIsDocumentHidden;
    this.onUpdateAvailable = options.onUpdateAvailable;
  }

  get updateAvailable(): boolean {
    return this.available;
  }

  get latestBuildId(): string | null {
    return this.latest;
  }

  checkNow(): Promise<void> {
    if (!isPresent(this.currentBuildId)) return Promise.resolve();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.resolve();
    }
    if (this.inFlight) return this.inFlight;

    const promise = this.runCheck().finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }

  start(): () => void {
    if (this.stopFn) return this.stopFn;

    void this.checkNow();
    const interval = setInterval(() => {
      if (!this.isDocumentHidden()) void this.checkNow();
    }, this.intervalMs);

    const stop = (): void => {
      if (this.stopFn !== stop) return;
      clearInterval(interval);
      this.stopFn = null;
      this.available = false;
      this.latest = null;
      this.dismissedBuildId = null;
      this.inFlight = null;
    };
    this.stopFn = stop;
    return stop;
  }

  dismiss(): void {
    this.available = false;
    if (this.latest !== null) this.dismissedBuildId = this.latest;
  }

  private async runCheck(): Promise<void> {
    let latest: string | null;
    try {
      latest = await this.fetchLatestBuildId();
    } catch {
      return;
    }
    if (!isPresent(latest)) return;

    this.latest = latest;
    if (latest === this.currentBuildId) {
      this.available = false;
      return;
    }
    if (latest === this.dismissedBuildId) {
      this.available = false;
      return;
    }
    if (!this.available) {
      this.available = true;
      this.onUpdateAvailable?.(latest);
    }
  }
}
