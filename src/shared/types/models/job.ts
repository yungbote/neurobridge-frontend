import type { JsonInput } from "./common";

export interface Job {
  id: string;
  jobType?: string | null;
  status?: string | null;
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
  error?: string | null;
  result?: JsonInput;
  Result?: JsonInput;
  payload?: JsonInput;
  Payload?: JsonInput;
}

export interface JobStageSnapshot {
  status?: string;
  childJobId?: string | null;
  childJobStatus?: string | null;
  childMessage?: string | null;
  childProgress?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
}

export interface LearningBuildResult {
  pathId?: string | null;
  stages?: Record<string, JobStageSnapshot>;
}
