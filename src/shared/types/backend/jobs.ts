import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendJobStageSnapshot {
  status?: string;
  child_job_id?: UUID | string | null;
  child_job_status?: string | null;
  child_message?: string | null;
  child_progress?: number | null;
  started_at?: ISODateTimeString | null;
  finished_at?: ISODateTimeString | null;
  last_error?: string | null;
}

export interface BackendLearningBuildResult {
  path_id?: UUID | string | null;
  stages?: Record<string, BackendJobStageSnapshot>;
}

export interface BackendJob {
  id: UUID | string;
  job_type?: string;
  status?: string;
  stage?: string;
  progress?: number | null;
  message?: string | null;
  error?: string | null;
  result?: JsonValue | string | null;
  Result?: JsonValue | string | null;
  payload?: JsonValue | string | null;
  Payload?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}
