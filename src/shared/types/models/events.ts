import type { JsonInput } from "./common";

export interface ClientEvent {
  clientEventId?: string;
  type: string;
  occurredAt?: string;
  pathId?: string;
  pathNodeId?: string;
  activityId?: string;
  activityVariant?: string;
  modality?: string;
  conceptIds?: string[];
  data?: JsonInput;
}

export interface EventIngestResult {
  ok: boolean;
  ingested: number;
}
