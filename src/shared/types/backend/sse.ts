import type { JsonValue } from "./common";

export interface BackendSseMessage {
  event: string;
  channel: string;
  data?: JsonValue | null;
}
