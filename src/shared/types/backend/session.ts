import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendSessionState {
  session_id: UUID | string;
  user_id: UUID | string;

  active_path_id?: UUID | string | null;
  active_path_node_id?: UUID | string | null;
  active_activity_id?: UUID | string | null;
  active_chat_thread_id?: UUID | string | null;
  active_job_id?: UUID | string | null;

  active_route?: string | null;
  active_view?: string | null;
  active_doc_block_id?: string | null;
  scroll_percent?: number | null;

  metadata?: JsonValue | string | null;

  last_seen_at?: ISODateTimeString | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendSessionStateResponse {
  state?: BackendSessionState | null;
}

