import axiosClient from "./AxiosClient";
import type { BackendEventIngestResponse } from "@/shared/types/backend";
import type { ClientEvent, EventIngestResult } from "@/shared/types/models";

function normalizeEvent(e: ClientEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { type: e.type };
  if (e.clientEventId) out.client_event_id = e.clientEventId;
  if (e.occurredAt) out.occurred_at = e.occurredAt;
  if (e.pathId) out.path_id = e.pathId;
  if (e.pathNodeId) out.path_node_id = e.pathNodeId;
  if (e.activityId) out.activity_id = e.activityId;
  if (e.data !== undefined) out.data = e.data;
  return out;
}

export async function ingestEvents(events: ClientEvent[]): Promise<EventIngestResult> {
  const arr = Array.isArray(events) ? events.filter(Boolean) : [];
  if (arr.length === 0) return { ok: true, ingested: 0 };
  const resp = await axiosClient.post<BackendEventIngestResponse>("/events", {
    events: arr.map(normalizeEvent),
  });
  const data = resp?.data ?? resp;
  return {
    ok: Boolean(data?.ok ?? true),
    ingested: typeof data?.ingested === "number" ? data.ingested : arr.length,
  };
}
