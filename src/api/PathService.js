import axiosClient from "./AxiosClient";

export function mapPath(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    title: raw.title ?? "",
    description: raw.description ?? "",
    status: raw.status ?? "",
    jobId: raw.job_id ?? raw.jobId ?? null,
    jobStatus: raw.job_status ?? raw.jobStatus ?? null,
    jobStage: raw.job_stage ?? raw.jobStage ?? null,
    jobProgress:
      typeof raw.job_progress === "number"
        ? raw.job_progress
        : typeof raw.jobProgress === "number"
          ? raw.jobProgress
          : null,
    jobMessage: raw.job_message ?? raw.jobMessage ?? null,
    metadata: raw.metadata ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
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
    metadata: raw.metadata ?? null,
    contentJson: raw.content_json ?? raw.contentJson ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapConcept(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    scope: raw.scope ?? null,
    scopeId: raw.scope_id ?? raw.scopeId ?? null,
    parentId: raw.parent_id ?? raw.parentId ?? null,

    depth: typeof raw.depth === "number" ? raw.depth : 0,
    sortIndex: typeof raw.sort_index === "number" ? raw.sort_index : raw.sortIndex ?? 0,

    key: raw.key ?? "",
    name: raw.name ?? "",
    summary: raw.summary ?? "",
    keyPoints: raw.key_points ?? raw.keyPoints ?? [],
    metadata: raw.metadata ?? null,

    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapConceptEdge(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    fromConceptId: raw.from_concept_id ?? raw.fromConceptID ?? raw.fromConceptId ?? null,
    toConceptId: raw.to_concept_id ?? raw.toConceptID ?? raw.toConceptId ?? null,
    edgeType: raw.edge_type ?? raw.edgeType ?? "",
    strength: typeof raw.strength === "number" ? raw.strength : 1,
    evidence: raw.evidence ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function listPaths() {
  const resp = await axiosClient.get("/paths");
  const raws = resp.data?.paths || [];
  return raws.map(mapPath).filter(Boolean);
}

export async function getPath(pathId) {
  if (!pathId) throw new Error("getPath: missing pathId");
  const resp = await axiosClient.get(`/paths/${pathId}`);
  return mapPath(resp.data?.path);
}

export async function listNodesForPath(pathId) {
  if (!pathId) throw new Error("listNodesForPath: missing pathId");
  const resp = await axiosClient.get(`/paths/${pathId}/nodes`);
  const raws = resp.data?.nodes || [];
  return raws.map(mapPathNode).filter(Boolean);
}

export async function getConceptGraph(pathId) {
  if (!pathId) throw new Error("getConceptGraph: missing pathId");
  const resp = await axiosClient.get(`/paths/${pathId}/concept-graph`);
  const concepts = (resp.data?.concepts || []).map(mapConcept).filter(Boolean);
  const edges = (resp.data?.edges || []).map(mapConceptEdge).filter(Boolean);
  return { concepts, edges };
}
