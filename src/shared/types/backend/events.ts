import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendEvent {
  client_event_id?: string;
  type: string;
  occurred_at?: ISODateTimeString;
  path_id?: UUID | string;
  path_node_id?: UUID | string;
  activity_id?: UUID | string;
  data?: JsonValue | string | null;
}

export interface BackendEventIngestResponse {
  ok?: boolean;
  ingested?: number;
}
