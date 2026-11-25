import {
  LoginCodeError,
  type LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

// Fixed timestamps keep the preview details and screenshots deterministic; the
// harness runs with locale en-US and timezone UTC.
const SERVER_TIME = "2026-11-25T12:00:00.000Z";
const PREVIEW_CREATED_AT = "2026-11-25T12:00:00.000Z";
const PREVIEW_EXPIRES_AT = "2026-11-25T12:05:00.000Z";
const DEVICE_LABEL = "Pixel 8 (Chrome 139)";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

export interface StubServiceOptions {
  /** Makes `create` fail, so `LoginWithCodeCard` renders its retry state. */
  createFails?: boolean;
  /** Makes `preview` fail with RATE_LIMITED, so the approver card shows an
   * error on the card surface. */
  previewFails?: boolean;
}

/**
 * No-network `LoginCodeService` stub: capabilities enabled, `create` returns a
 * fixed code, `poll` never settles (the advertised interval is one hour, so it
 * is never called during a test), `preview` returns a device, `approve` and
 * `cancel` resolve.
 */
export function createStubService(
  options: StubServiceOptions = {},
): LoginCodeService {
  const inSeconds = (seconds: number): string =>
    new Date(Date.now() + seconds * 1000).toISOString();

  const service = {
    capabilities: async () => ({
      enabled: true,
      available: true,
      codeLength: 8,
      rotationSeconds: 30,
      graceSeconds: 60,
      ttlSeconds: 300,
      pollIntervalMs: 3_600_000,
      approveRequiresPassword: false,
      serverTime: SERVER_TIME,
    }),
    create: async () => {
      if (options.createFails) {
        throw new LoginCodeError("NETWORK", undefined, { retryable: true });
      }
      return {
        requestToken: "theme-harness-request",
        code: "BCDFGHJK",
        codeExpiresAt: inSeconds(30),
        expiresAt: inSeconds(300),
        serverTime: new Date().toISOString(),
      };
    },
    poll: () => new Promise<never>(() => {}),
    preview: async () => {
      if (options.previewFails) throw new LoginCodeError("RATE_LIMITED");
      return {
        deviceLabel: DEVICE_LABEL,
        userAgent: USER_AGENT,
        createdAt: PREVIEW_CREATED_AT,
        expiresAt: PREVIEW_EXPIRES_AT,
        userName: "Ada Lovelace",
        serverTime: SERVER_TIME,
      };
    },
    approve: async () => ({
      approved: true,
      expiresAt: PREVIEW_EXPIRES_AT,
      serverTime: SERVER_TIME,
    }),
    cancel: async () => ({
      status: "cancelled",
      serverTime: SERVER_TIME,
    }),
  };

  return service as unknown as LoginCodeService;
}
