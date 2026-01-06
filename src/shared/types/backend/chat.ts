import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendChatThread {
  id: UUID | string;
  user_id?: UUID | string | null;
  path_id?: UUID | string | null;
  job_id?: UUID | string | null;
  title?: string;
  status?: string;
  metadata?: JsonValue | string | null;
  next_seq?: number;
  last_message_at?: ISODateTimeString | null;
  last_viewed_at?: ISODateTimeString | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendChatMessage {
  id: UUID | string;
  thread_id?: UUID | string | null;
  user_id?: UUID | string | null;
  seq?: number | string;
  role?: string;
  status?: string;
  content?: string;
  metadata?: JsonValue | string | null;
  idempotency_key?: string;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendChatThreadResponse {
  thread?: BackendChatThread | null;
  messages?: BackendChatMessage[];
}

export interface BackendChatThreadsResponse {
  threads?: BackendChatThread[];
}

export interface BackendChatSendResponse {
  user_message?: BackendChatMessage | null;
  assistant_message?: BackendChatMessage | null;
  job?: JsonValue | null;
}
