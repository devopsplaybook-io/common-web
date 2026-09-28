import mitt from "mitt";

export interface AlertMessage {
  type?: "info" | "success" | "warning" | "error" | string;
  text: string;
  durationMs?: number;
}

interface AppEvents {
  [event: string]: unknown;
  [event: symbol]: unknown;
  ALERT_MESSAGE: AlertMessage;
  AUTH_UPDATED: void;
}

export const EventTypes = {
  ALERT_MESSAGE: "ALERT_MESSAGE",
  AUTH_UPDATED: "AUTH_UPDATED",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const EventBus = mitt<AppEvents>();

export function handleError(error: unknown): void {
  console.error(error);
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
