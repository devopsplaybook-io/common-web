import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  LoginCodeError,
  LoginCodeService,
  type LoginCodeCapabilities,
  type LoginCodePollResult,
} from "../services/LoginCodeService";

export type LoginCodeStatus =
  | "idle"
  | "creating"
  | "waiting"
  | "approved"
  | "expired"
  | "cancelled"
  | "error";

export const LOGIN_CODE_DEFAULT_POLL_INTERVAL_MS = 2000;
export const LOGIN_CODE_MAX_POLL_FAILURES = 5;
export const LOGIN_CODE_MAX_POLL_BACKOFF_MS = 30_000;

const TICK_INTERVAL_MS = 1000;
const TERMINAL_STATUSES: ReadonlySet<LoginCodeStatus> = new Set([
  "approved",
  "expired",
  "cancelled",
  "error",
]);

export interface UseLoginCodeOptions {
  service?: LoginCodeService;
  onSession?: (token: string, user: unknown) => void | Promise<void>;
}

export interface UseLoginCodeResult {
  status: Ref<LoginCodeStatus>;
  code: Ref<string | null>;
  formattedCode: ComputedRef<string | null>;
  secondsUntilRefresh: ComputedRef<number | null>;
  secondsUntilExpiry: ComputedRef<number | null>;
  error: Ref<LoginCodeError | null>;
  enabled: ComputedRef<boolean>;
  available: ComputedRef<boolean>;
  capabilities: Ref<LoginCodeCapabilities | null>;
  session: Ref<{ token: string; user: unknown } | null>;
  user: ComputedRef<unknown>;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCode(value: string): string {
  return value.match(/.{1,4}/g)?.join("-") ?? value;
}

export function useLoginCode(
  options: UseLoginCodeOptions = {},
): UseLoginCodeResult {
  const service =
    options.service ??
    // The composable owns `onSession`; an injected service may own it instead.
    new LoginCodeService();
  const sessionHandler = options.onSession;

  const status = ref<LoginCodeStatus>("idle");
  const code = ref<string | null>(null);
  const error = ref<LoginCodeError | null>(null);
  const capabilities = ref<LoginCodeCapabilities | null>(null);
  const session = ref<{ token: string; user: unknown } | null>(null);
  const clock = ref(Date.now());
  const clockOffset = ref(0);
  const codeDeadline = ref<number | null>(null);
  const expiryDeadline = ref<number | null>(null);

  let capabilitiesPromise: Promise<LoginCodeCapabilities | null> | null = null;
  let capabilitiesController: AbortController | null = null;
  let inFlight: AbortController | null = null;
  let requestToken: string | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let failures = 0;
  let polling = false;
  // Two counters guard asynchronous continuations: `generation` invalidates a
  // whole flow (start/cancel/unmount) and `pollAttempt` invalidates a single
  // poll (pause/resume) so a stale answer can never win.
  let generation = 0;
  let pollAttempt = 0;

  const enabled = computed(() => capabilities.value?.enabled === true);
  const available = computed(() => capabilities.value?.available === true);
  const formattedCode = computed(() =>
    code.value ? formatCode(code.value) : null,
  );
  const user = computed(() => session.value?.user ?? null);

  function remainingSeconds(deadline: number | null): number | null {
    if (deadline === null) return null;
    const serverNow = clock.value + clockOffset.value;
    return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
  }

  const secondsUntilRefresh = computed(() => remainingSeconds(codeDeadline.value));
  const secondsUntilExpiry = computed(() => remainingSeconds(expiryDeadline.value));

  function pollInterval(): number {
    const advertised = capabilities.value?.pollIntervalMs;
    return typeof advertised === "number" &&
      Number.isFinite(advertised) &&
      advertised > 0
      ? advertised
      : LOGIN_CODE_DEFAULT_POLL_INTERVAL_MS;
  }

  function adoptServerTime(serverTime: unknown): void {
    const now = Date.now();
    clock.value = now;
    const parsed = parseTimestamp(serverTime);
    if (parsed !== null) clockOffset.value = parsed - now;
  }

  function applyDeadlines(codeExpiresAt: unknown, expiresAt: unknown): void {
    codeDeadline.value = parseTimestamp(codeExpiresAt);
    expiryDeadline.value = parseTimestamp(expiresAt);
  }

  function clearPollTimer(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function clearTicker(): void {
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function stopTimers(): void {
    clearPollTimer();
    clearTicker();
  }

  function startTicker(): void {
    clearTicker();
    tickTimer = setInterval(() => {
      clock.value = Date.now();
    }, TICK_INTERVAL_MS);
  }

  function abortInFlight(): void {
    inFlight?.abort();
    inFlight = null;
  }

  function abortCapabilities(): void {
    capabilitiesController?.abort();
    capabilitiesController = null;
  }

  function loadCapabilities(): Promise<LoginCodeCapabilities | null> {
    if (capabilities.value) return Promise.resolve(capabilities.value);
    if (capabilitiesPromise) return capabilitiesPromise;

    const controller = new AbortController();
    capabilitiesController = controller;
    const promise = service
      .capabilities({ signal: controller.signal })
      .then((result) => {
        capabilities.value = result;
        return result;
      })
      .catch(() => null)
      .finally(() => {
        if (capabilitiesController === controller) capabilitiesController = null;
        // A failed probe is retried by the next start/retry.
        if (!capabilities.value) capabilitiesPromise = null;
      });
    capabilitiesPromise = promise;
    return promise;
  }

  function schedulePoll(delay: number): void {
    clearPollTimer();
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void poll();
    }, delay);
  }

  async function poll(): Promise<void> {
    if (status.value !== "waiting" || polling) return;
    if (typeof window === "undefined") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    const flow = generation;
    const attempt = ++pollAttempt;
    const controller = new AbortController();
    inFlight = controller;
    polling = true;

    try {
      const result = await service.poll(requestToken ?? "", {
        signal: controller.signal,
      });
      if (flow !== generation || attempt !== pollAttempt) return;
      applyPollResult(result);
    } catch (caught) {
      if (flow !== generation || attempt !== pollAttempt) return;
      handlePollFailure(caught);
    } finally {
      polling = false;
      if (inFlight === controller) inFlight = null;
    }
  }

  function applyPollResult(result: LoginCodePollResult): void {
    failures = 0;
    adoptServerTime(result.serverTime);

    switch (result.status) {
      case "pending":
        if (typeof result.code === "string" && result.code.length > 0) {
          code.value = result.code;
        }
        applyDeadlines(result.codeExpiresAt, result.expiresAt);
        schedulePoll(pollInterval());
        return;
      case "approved":
        session.value = { token: result.token, user: result.user };
        codeDeadline.value = null;
        expiryDeadline.value = parseTimestamp(result.expiresAt);
        status.value = "approved";
        stopTimers();
        void notifySession(result.token, result.user);
        return;
      case "expired":
        status.value = "expired";
        stopTimers();
        return;
      case "cancelled":
        status.value = "cancelled";
        stopTimers();
        return;
      case "failed":
        error.value = new LoginCodeError("FAILED");
        status.value = "error";
        stopTimers();
    }
  }

  async function notifySession(token: string, userValue: unknown): Promise<void> {
    if (!sessionHandler) return;
    try {
      await sessionHandler(token, userValue);
    } catch {
      // Redemption already succeeded; a failing session writer is not a login
      // failure.
    }
  }

  function handlePollFailure(caught: unknown): void {
    const failure =
      caught instanceof LoginCodeError
        ? caught
        : new LoginCodeError("NETWORK", undefined, { retryable: true });
    if (failure.code === "ABORTED") return;

    failures += 1;
    if (!failure.retryable || failures >= LOGIN_CODE_MAX_POLL_FAILURES) {
      error.value = failure;
      status.value = "error";
      stopTimers();
      return;
    }
    const backoff = Math.min(
      LOGIN_CODE_MAX_POLL_BACKOFF_MS,
      pollInterval() * 2 ** (failures - 1),
    );
    schedulePoll(backoff);
  }

  function pausePolling(): void {
    if (status.value !== "waiting") return;
    pollAttempt += 1;
    abortInFlight();
    stopTimers();
  }

  function resumePolling(): void {
    if (status.value !== "waiting") return;
    clock.value = Date.now();
    startTicker();
    void poll();
  }

  function handleVisibilityChange(): void {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") pausePolling();
    else resumePolling();
  }

  function handleFocus(): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    resumePolling();
  }

  async function start(): Promise<void> {
    if (typeof window === "undefined") return;

    const flow = ++generation;
    pollAttempt += 1;
    abortInFlight();
    stopTimers();
    status.value = "creating";
    code.value = null;
    error.value = null;
    session.value = null;
    codeDeadline.value = null;
    expiryDeadline.value = null;
    requestToken = null;
    failures = 0;
    clock.value = Date.now();

    const resolved = await loadCapabilities();
    if (flow !== generation) return;
    if (!resolved || !resolved.enabled || !resolved.available) {
      error.value = new LoginCodeError("LOGIN_CODE_UNAVAILABLE");
      status.value = "error";
      return;
    }
    adoptServerTime(resolved.serverTime);

    const controller = new AbortController();
    inFlight = controller;
    try {
      const request = await service.create({ signal: controller.signal });
      if (flow !== generation) return;
      requestToken = request.requestToken;
      code.value = request.code;
      applyDeadlines(request.codeExpiresAt, request.expiresAt);
      adoptServerTime(request.serverTime);
      status.value = "waiting";
      startTicker();
      schedulePoll(pollInterval());
    } catch (caught) {
      if (flow !== generation) return;
      const failure =
        caught instanceof LoginCodeError
          ? caught
          : new LoginCodeError("NETWORK", undefined, { retryable: true });
      if (failure.code === "ABORTED") return;
      error.value = failure;
      status.value = "error";
      stopTimers();
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  }

  async function cancel(): Promise<void> {
    if (TERMINAL_STATUSES.has(status.value)) return;

    const token = requestToken;
    generation += 1;
    pollAttempt += 1;
    abortInFlight();
    stopTimers();
    requestToken = null;
    status.value = "cancelled";

    if (token) {
      try {
        await service.cancel(token);
      } catch {
        // Best effort: the request may already be terminal server-side.
      }
    }
  }

  function retry(): Promise<void> {
    return start();
  }

  onMounted(() => {
    if (typeof window === "undefined") return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void loadCapabilities();
  });

  onUnmounted(() => {
    generation += 1;
    pollAttempt += 1;
    abortInFlight();
    abortCapabilities();
    stopTimers();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
  });

  return {
    status,
    code,
    formattedCode,
    secondsUntilRefresh,
    secondsUntilExpiry,
    error,
    enabled,
    available,
    capabilities,
    session,
    user,
    start,
    cancel,
    retry,
  };
}
