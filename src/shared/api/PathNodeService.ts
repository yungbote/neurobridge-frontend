import axiosClient from "./AxiosClient";
import axios from "axios";
import type {
  BackendNodeActivity,
  BackendNodeDocRevision,
  BackendNodeDocRevisionResponse,
  BackendPathNode,
} from "@/shared/types/backend";
import type { DrillPayloadV1 } from "@/shared/types/drillPayloadV1";
import type { DrillSpec, NodeActivity, NodeDocRevision, PathNode } from "@/shared/types/models";
import type { JsonValue } from "@/shared/types/backend/common";

type NodeActivityRecord = BackendNodeActivity & Partial<NodeActivity>;
type PathNodeRecord = BackendPathNode & Partial<PathNode>;
type RevisionRecord = BackendNodeDocRevision & Partial<NodeDocRevision>;

export function mapNodeActivity(raw: BackendNodeActivity | NodeActivity | null | undefined): NodeActivity | null {
  if (!raw) return null;
  const row = raw as NodeActivityRecord;
  return {
    id: String(row.id),
    pathNodeActivityId: (row.path_node_activity_id ?? row.pathNodeActivityId ?? null) as string | null,
    pathNodeId: (row.path_node_id ?? row.pathNodeId ?? null) as string | null,
    rank: typeof row.rank === "number" ? row.rank : 0,
    isPrimary: Boolean(row.is_primary ?? row.isPrimary),
    kind: row.kind ?? "reading",
    title: row.title ?? "",
    estimatedMinutes:
      typeof row.estimated_minutes === "number"
        ? row.estimated_minutes
        : (row.estimatedMinutes ?? null),
    difficulty: (row.difficulty ?? null) as string | null,
    status: row.status ?? "",
  };
}

function safeParseJSON(v: unknown): JsonValue | string | null {
  if (!v) return null;
  if (typeof v === "object") return v as JsonValue;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as JsonValue;
    } catch {
      return null;
    }
  }
  return null;
}

export function mapPathNode(raw: BackendPathNode | PathNode | null | undefined): PathNode | null {
  if (!raw) return null;
  const row = raw as PathNodeRecord;
  const docStatusRaw = safeParseJSON((row as { doc_status?: unknown; docStatus?: unknown }).doc_status ?? row.docStatus);
  const unlockEstimateRaw = safeParseJSON((row as { unlock_estimate?: unknown; unlockEstimate?: unknown }).unlock_estimate ?? row.unlockEstimate);
  const unlockRequirementsRaw = safeParseJSON((row as { unlock_requirements?: unknown; unlockRequirements?: unknown }).unlock_requirements ?? row.unlockRequirements);
  return {
    id: String(row.id),
    pathId: (row.path_id ?? row.pathId ?? null) as string | null,
    index: typeof row.index === "number" ? row.index : 0,
    title: row.title ?? "",
    parentNodeId: (row.parent_node_id ?? row.parentNodeId ?? null) as string | null,
    gating: (row.gating ?? null) as PathNode["gating"],
    metadata: (safeParseJSON(row.metadata) ?? row.metadata ?? null) as PathNode["metadata"],
    contentJson:
      (safeParseJSON(row.content_json ?? row.contentJson) ?? row.content_json ?? row.contentJson ?? null) as
        PathNode["contentJson"],
    availabilityStatus:
      ((row as { availability_status?: string; availabilityStatus?: string }).availability_status ??
        row.availabilityStatus ??
        null) as string | null,
    availabilityReason:
      ((row as { availability_reason?: string; availabilityReason?: string }).availability_reason ??
        row.availabilityReason ??
        null) as string | null,
    docStatus: (docStatusRaw ?? null) as PathNode["docStatus"],
    unlockEstimate: (unlockEstimateRaw ?? null) as PathNode["unlockEstimate"],
    unlockRequirements: (unlockRequirementsRaw ?? null) as PathNode["unlockRequirements"],
    unlockSource:
      ((row as { unlock_source?: string; unlockSource?: string }).unlock_source ?? row.unlockSource ?? null) as
        string | null,
    unlockPolicy:
      ((row as { unlock_policy?: string; unlockPolicy?: string }).unlock_policy ?? row.unlockPolicy ?? null) as
        string | null,
    lastEvalAt:
      ((row as { last_eval_at?: string; lastEvalAt?: string }).last_eval_at ?? row.lastEvalAt ?? null) as
        string | null,
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapDrillSpec(raw: Record<string, unknown> | DrillSpec | null | undefined): DrillSpec | null {
  if (!raw) return null;
  const row = raw as DrillSpec & Record<string, unknown>;
  const legacySuggested = (row as { suggested_count?: number }).suggested_count;
  const camelSuggested = (row as { suggestedCount?: number | null }).suggestedCount;
  return {
    kind: row.kind ?? "",
    label: row.label ?? "",
    reason: row.reason ?? "",
    suggestedCount:
      typeof legacySuggested === "number"
        ? legacySuggested
        : typeof camelSuggested === "number"
          ? camelSuggested
          : null,
  };
}

export function mapNodeDocRevision(raw: BackendNodeDocRevision | NodeDocRevision | null | undefined): NodeDocRevision | null {
  if (!raw) return null;
  const row = raw as RevisionRecord;
  return {
    id: row.id ? String(row.id) : undefined,
    blockId: row.block_id ?? row.blockId ?? undefined,
    blockIndex:
      typeof row.block_index === "number"
        ? row.block_index
        : typeof row.blockIndex === "number"
          ? row.blockIndex
          : null,
    pathNodeId: row.path_node_id ?? row.pathNodeId ?? undefined,
    beforeJson: row.before_json ?? row.beforeJson ?? null,
    afterJson: row.after_json ?? row.afterJson ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export async function listActivitiesForNode(pathNodeId: string): Promise<NodeActivity[]> {
  if (!pathNodeId) throw new Error("listActivitiesForNode: missing pathNodeId");
  const resp = await axiosClient.get<{ activities?: BackendNodeActivity[] }>(
    `/path-nodes/${pathNodeId}/activities`
  );
  const raws = resp.data?.activities || [];
  return raws.map(mapNodeActivity).filter(Boolean) as NodeActivity[];
}

export async function getPathNodeContent(pathNodeId: string): Promise<PathNode | null> {
  if (!pathNodeId) throw new Error("getPathNodeContent: missing pathNodeId");
  const resp = await axiosClient.get<{ node?: BackendPathNode | null }>(`/path-nodes/${pathNodeId}/content`);
  return mapPathNode(resp.data?.node ?? null);
}

export async function getPathNodeDoc(pathNodeId: string): Promise<JsonValue | string | null> {
  const payload = await getPathNodeDocEnvelope(pathNodeId);
  return payload.doc ?? null;
}

export interface PathNodeDocEnvelope {
  doc: JsonValue | string | null;
  doc_status?: JsonValue | string | null;
  prereq_gate?: JsonValue | string | null;
  evidence?: JsonValue | string | null;
  availability_status?: string | null;
  availability_reason?: string | null;
  unlock_estimate?: JsonValue | string | null;
  error_code?: string | null;
  http_status: number;
}

export async function getPathNodeDocEnvelope(pathNodeId: string): Promise<PathNodeDocEnvelope> {
  if (!pathNodeId) throw new Error("getPathNodeDoc: missing pathNodeId");
  try {
    const resp = await axiosClient.get<Record<string, unknown>>(`/path-nodes/${pathNodeId}/doc`);
    return {
      doc: (resp.data?.doc ?? null) as JsonValue | string | null,
      doc_status: (resp.data?.doc_status ?? null) as JsonValue | string | null,
      prereq_gate: (resp.data?.prereq_gate ?? null) as JsonValue | string | null,
      evidence: (resp.data?.evidence ?? null) as JsonValue | string | null,
      availability_status: (resp.data?.availability_status ?? null) as string | null,
      availability_reason: (resp.data?.availability_reason ?? null) as string | null,
      unlock_estimate: (resp.data?.unlock_estimate ?? null) as JsonValue | string | null,
      error_code: null,
      http_status: resp.status,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const data = (err.response.data ?? {}) as Record<string, unknown>;
      const apiErr = (data.error ?? null) as Record<string, unknown> | null;
      return {
        doc: (data.doc ?? null) as JsonValue | string | null,
        doc_status: (data.doc_status ?? null) as JsonValue | string | null,
        prereq_gate: (data.prereq_gate ?? null) as JsonValue | string | null,
        evidence: (data.evidence ?? null) as JsonValue | string | null,
        availability_status: (data.availability_status ?? null) as string | null,
        availability_reason: (data.availability_reason ?? null) as string | null,
        unlock_estimate: (data.unlock_estimate ?? null) as JsonValue | string | null,
        error_code: (apiErr?.code ?? String(err.response.status)) as string,
        http_status: err.response.status,
      };
    }
    throw err;
  }
}

export interface PathNodeDocPatchPayload {
  block_id?: string;
  block_index?: number;
  action?: string;
  citation_policy?: string;
  instruction?: string;
}

export async function enqueuePathNodeDocPatch(
  pathNodeId: string,
  payload: PathNodeDocPatchPayload
): Promise<Record<string, unknown>> {
  if (!pathNodeId) throw new Error("enqueuePathNodeDocPatch: missing pathNodeId");
  if (!payload || typeof payload !== "object") {
    throw new Error("enqueuePathNodeDocPatch: missing payload");
  }
  const resp = await axiosClient.post<Record<string, unknown>>(`/path-nodes/${pathNodeId}/doc/patch`, payload);
  return resp.data ?? {};
}

export async function listPathNodeDocRevisions(
  pathNodeId: string,
  {
    limit,
    includeDocs,
  }: {
    limit?: number;
    includeDocs?: boolean;
  } = {}
): Promise<NodeDocRevision[]> {
  if (!pathNodeId) throw new Error("listPathNodeDocRevisions: missing pathNodeId");
  const params: Record<string, string | number> = {};
  if (typeof limit === "number") params.limit = limit;
  if (includeDocs === true) params.include_docs = "1";
  const resp = await axiosClient.get<BackendNodeDocRevisionResponse>(
    `/path-nodes/${pathNodeId}/doc/revisions`,
    { params }
  );
  const raws = resp.data?.revisions || [];
  return raws.map(mapNodeDocRevision).filter(Boolean) as NodeDocRevision[];
}

export async function listDrillsForNode(pathNodeId: string): Promise<DrillSpec[]> {
  if (!pathNodeId) throw new Error("listDrillsForNode: missing pathNodeId");
  const resp = await axiosClient.get<{ drills?: Record<string, unknown>[] }>(`/path-nodes/${pathNodeId}/drills`);
  const raws = resp.data?.drills || [];
  return raws.map(mapDrillSpec).filter(Boolean) as DrillSpec[];
}

// TODO: Generation is timing out; needs fix
export async function generateDrillForNode(
  pathNodeId: string,
  kind: string,
  { count }: { count?: number } = {}
): Promise<DrillPayloadV1 | null> {
  if (!pathNodeId) throw new Error("generateDrillForNode: missing pathNodeId");
  const k = String(kind || "").trim();
  if (!k) throw new Error("generateDrillForNode: missing kind");
  const body: Record<string, number> = {};
  if (typeof count === "number" && Number.isFinite(count) && count > 0) body.count = count;
  const resp = await axiosClient.post<{ drill?: DrillPayloadV1 | null }>(
    `/path-nodes/${pathNodeId}/drills/${encodeURIComponent(k)}`,
    body
  );
  return resp.data?.drill ?? null;
}

export type QuickCheckAttemptAction = "submit" | "hint";

export interface QuickCheckAttemptPayload {
  action: QuickCheckAttemptAction;
  answer?: string;
  client_event_id?: string;
  occurred_at?: string;
  latency_ms?: number;
  confidence?: number;
  correlation_id?: string;
  prompt_id?: string;
  prompt_instance_id?: string;
}

export interface QuickCheckAttemptResult {
  status: "correct" | "try_again" | "wrong" | "hint";
  is_correct: boolean;
  feedback_md: string;
  hint_md: string;
  confidence: number;
}

export async function attemptQuickCheck(
  pathNodeId: string,
  blockId: string,
  payload: QuickCheckAttemptPayload
): Promise<QuickCheckAttemptResult | null> {
  if (!pathNodeId) throw new Error("attemptQuickCheck: missing pathNodeId");
  if (!blockId) throw new Error("attemptQuickCheck: missing blockId");
  if (!payload || typeof payload !== "object") throw new Error("attemptQuickCheck: missing payload");
  const resp = await axiosClient.post<{ result?: QuickCheckAttemptResult | null }>(
    `/path-nodes/${pathNodeId}/quick-checks/${encodeURIComponent(blockId)}/attempt`,
    payload
  );
  return resp.data?.result ?? null;
}
