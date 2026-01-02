import type { BackendJob } from "@/shared/types/backend";
import type { JsonInput } from "./common";
import type { Job } from "./job";

export interface SseMessage<T = JsonInput> {
  event: string;
  channel: string;
  data: T;
}

export interface JobEventPayload {
  job_id?: string;
  jobId?: string;
  job_type?: string;
  jobType?: string;
  stage?: string;
  progress?: number;
  message?: string;
  error?: string;
  path_id?: string;
  pathId?: string;
  job?: Job | BackendJob;
}

export interface UserNameChangedPayload {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

export interface UserThemeChangedPayload {
  preferred_theme?: string;
  preferred_ui_theme?: string;
}

export interface UserAvatarChangedPayload {
  avatar_url?: string;
  avatar_color?: string;
}
