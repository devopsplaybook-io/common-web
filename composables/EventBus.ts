import mitt from "mitt";

export type AlertType = "info" | "success" | "warning" | "error";

export type AuthRenewalFailureReason =
  | "timeout"
  | "5xx"
  | "network"
  | "invalid-response";

export interface AlertMessage {
  type?: AlertType;
  text: string;
  durationMs?: number;
}

export interface AuthRenewalFailedEvent {
  reason: AuthRenewalFailureReason;
}

export interface HandleErrorOptions {
  debug?: boolean;
}

// mitt's Emitter constraint requires string and symbol index signatures;
// the explicit ALERT_MESSAGE/AUTH_UPDATED/AUTH_RENEWAL_FAILED keys keep their
// payload typing.
interface AppEvents {
  [event: string]: unknown;
  [event: symbol]: unknown;
  ALERT_MESSAGE: AlertMessage;
  AUTH_UPDATED: void;
  AUTH_RENEWAL_FAILED: AuthRenewalFailedEvent;
}

export const EventTypes = {
  ALERT_MESSAGE: "ALERT_MESSAGE",
  AUTH_UPDATED: "AUTH_UPDATED",
  AUTH_RENEWAL_FAILED: "AUTH_RENEWAL_FAILED",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const EventBus = mitt<AppEvents>();

const SENSITIVE_HEADER =
  /authorization|proxy-authorization|cookie|set-cookie|x-api-key|token|secret|key|auth/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_VALUE =
  /[A-Za-z0-9_+/-]{6,}\.[A-Za-z0-9_+/=-]{6,}\.[A-Za-z0-9_+/=-]{6,}/g;

interface ErrorCandidate {
  message?: unknown;
  config?: {
    url?: unknown;
    method?: unknown;
    headers?: unknown;
  };
  response?: {
    status?: unknown;
  };
}

function redactText(text: string): string {
  return text
    .replace(BEARER_VALUE, "Bearer [redacted]")
    .replace(JWT_VALUE, "[redacted]");
}

function toPath(url: string): string {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

function toPlainHeaders(headers: unknown): Record<string, unknown> | null {
  if (typeof headers !== "object" || headers === null) return null;
  const candidate = headers as { toJSON?: () => unknown };
  if (typeof candidate.toJSON === "function") {
    const plain = candidate.toJSON();
    return typeof plain === "object" && plain !== null
      ? (plain as Record<string, unknown>)
      : null;
  }
  return headers as Record<string, unknown>;
}

function sanitizeHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  const plain = toPlainHeaders(headers);
  if (!plain) return undefined;
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(plain)) {
    sanitized[name] = SENSITIVE_HEADER.test(name)
      ? "[redacted]"
      : String(value);
  }
  return sanitized;
}

function errorMessage(error: unknown, candidate: ErrorCandidate): string {
  if (error instanceof Error) return error.message;
  if (typeof candidate.message === "string") return candidate.message;
  return String(error);
}

function sanitizeError(error: unknown): Record<string, unknown> {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as ErrorCandidate)
      : {};
  const summary: Record<string, unknown> = {
    message: redactText(errorMessage(error, candidate)),
  };

  const status = candidate.response?.status;
  if (typeof status === "number") summary.status = status;

  const method = candidate.config?.method;
  if (typeof method === "string") summary.method = method;

  const url = candidate.config?.url;
  if (typeof url === "string") summary.path = toPath(url);

  const headers = sanitizeHeaders(candidate.config?.headers);
  if (headers) summary.headers = headers;

  return summary;
}

export function handleError(
  error: unknown,
  options: HandleErrorOptions = {},
): void {
  console.error(options.debug ? error : sanitizeError(error));

  let text = error instanceof Error ? error.message : String(error);

  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (
      typeof response === "object" &&
      response !== null &&
      "data" in response &&
      typeof response.data === "object" &&
      response.data !== null &&
      "error" in response.data &&
      typeof response.data.error === "string"
    ) {
      text = response.data.error;
    }
  }

  EventBus.emit(EventTypes.ALERT_MESSAGE, { type: "error", text });
}
