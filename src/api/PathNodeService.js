import axiosClient from "./AxiosClient";

export function mapNodeActivity(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    pathNodeActivityId: raw.path_node_activity_id ?? raw.pathNodeActivityId ?? null,
    pathNodeId: raw.path_node_id ?? raw.pathNodeId ?? null,
    rank: typeof raw.rank === "number" ? raw.rank : 0,
    isPrimary: Boolean(raw.is_primary ?? raw.isPrimary),

    kind: raw.kind ?? "reading",
    title: raw.title ?? "",
    estimatedMinutes:
      typeof raw.estimated_minutes === "number"
        ? raw.estimated_minutes
        : raw.estimatedMinutes ?? null,
    difficulty: raw.difficulty ?? null,
    status: raw.status ?? "",
  };
}

function safeParseJSON(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

export function mapPathNode(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    pathId: raw.path_id ?? raw.pathId ?? null,
    index: typeof raw.index === "number" ? raw.index : 0,
    title: raw.title ?? "",
    parentNodeId: raw.parent_node_id ?? raw.parentNodeId ?? null,
    gating: raw.gating ?? null,
    metadata: safeParseJSON(raw.metadata) ?? raw.metadata ?? null,
    contentJson: safeParseJSON(raw.content_json ?? raw.contentJson) ?? raw.content_json ?? raw.contentJson ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapDrillSpec(raw) {
  if (!raw) return null;
  return {
    kind: raw.kind ?? "",
    label: raw.label ?? "",
    reason: raw.reason ?? "",
    suggestedCount:
      typeof raw.suggested_count === "number"
        ? raw.suggested_count
        : raw.suggestedCount ?? null,
  };
}

export async function listActivitiesForNode(pathNodeId) {
  if (!pathNodeId) throw new Error("listActivitiesForNode: missing pathNodeId");
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/activities`);
  const raws = resp.data?.activities || [];
  return raws.map(mapNodeActivity).filter(Boolean);
}

export async function getPathNodeContent(pathNodeId) {
  if (!pathNodeId) throw new Error("getPathNodeContent: missing pathNodeId");
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/content`);
  return mapPathNode(resp.data?.node);
}

export async function getPathNodeDoc(pathNodeId) {
  if (!pathNodeId) throw new Error("getPathNodeDoc: missing pathNodeId");
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/doc`);
  return resp.data?.doc ?? null;
}

export async function enqueuePathNodeDocPatch(pathNodeId, payload) {
  if (!pathNodeId) throw new Error("enqueuePathNodeDocPatch: missing pathNodeId");
  if (!payload || typeof payload !== "object") {
    throw new Error("enqueuePathNodeDocPatch: missing payload");
  }
  const resp = await axiosClient.post(`/path-nodes/${pathNodeId}/doc/patch`, payload);
  return resp.data ?? null;
}

export async function listPathNodeDocRevisions(pathNodeId, { limit, includeDocs } = {}) {
  if (!pathNodeId) throw new Error("listPathNodeDocRevisions: missing pathNodeId");
  const params = {};
  if (typeof limit === "number") params.limit = limit;
  if (includeDocs === true) params.include_docs = "1";
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/doc/revisions`, { params });
  return resp.data?.revisions ?? [];
}

export async function listDrillsForNode(pathNodeId) {
  if (!pathNodeId) throw new Error("listDrillsForNode: missing pathNodeId");
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/drills`);
  const raws = resp.data?.drills || [];
  return raws.map(mapDrillSpec).filter(Boolean);
}

// TODO: Generation is timing out; needs fix
export async function generateDrillForNode(pathNodeId, kind, { count } = {}) {
  if (!pathNodeId) throw new Error("generateDrillForNode: missing pathNodeId");
  const k = String(kind || "").trim();
  if (!k) throw new Error("generateDrillForNode: missing kind");
  const body = {};
  if (typeof count === "number" && Number.isFinite(count) && count > 0) body.count = count;
  const resp = await axiosClient.post(`/path-nodes/${pathNodeId}/drills/${encodeURIComponent(k)}`, body);
  return resp.data?.drill ?? null;
}
