import mitt from "mitt";

export type AlertType = "info" | "success" | "warning" | "error";

export interface AlertMessage {
  type?: AlertType;
  text: string;
  durationMs?: number;
}

// mitt's Emitter constraint requires string and symbol index signatures;
// the explicit ALERT_MESSAGE/AUTH_UPDATED keys keep their payload typing.
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
