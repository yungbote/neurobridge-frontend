import axiosClient from "./AxiosClient";
import type {
  BackendConcept,
  BackendConceptEdge,
  BackendConceptGraphResponse,
  BackendPath,
  BackendPathDetailResponse,
  BackendPathListResponse,
  BackendPathNode,
  BackendPathNodesResponse,
} from "@/shared/types/backend";
import type { Concept, ConceptEdge, Path, PathNode } from "@/shared/types/models";

type PathRecord = BackendPath & Partial<Path>;
type PathNodeRecord = BackendPathNode & Partial<PathNode>;
type ConceptRecord = BackendConcept & Partial<Concept>;
type ConceptEdgeRecord = BackendConceptEdge & Partial<ConceptEdge>;

export function mapPath(raw: BackendPath | Path | null | undefined): Path | null {
  if (!raw) return null;
  const row = raw as PathRecord;
  return {
    id: String(row.id),
    userId: (row.user_id ?? row.userId ?? null) as string | null,
    title: row.title ?? "",
    description: row.description ?? "",
    status: row.status ?? "",
    jobId: (row.job_id ?? row.jobId ?? null) as string | null,
    jobStatus: (row.job_status ?? row.jobStatus ?? null) as string | null,
    jobStage: (row.job_stage ?? row.jobStage ?? null) as string | null,
    jobProgress:
      typeof row.job_progress === "number"
        ? row.job_progress
        : typeof row.jobProgress === "number"
          ? row.jobProgress
          : null,
    jobMessage: (row.job_message ?? row.jobMessage ?? null) as string | null,
    avatarUrl: (row.avatar_url ?? row.avatarUrl ?? null) as string | null,
    avatarSquareUrl: (row.avatar_square_url ?? row.avatarSquareUrl ?? null) as string | null,
    avatarAssetId: (row.avatar_asset_id ?? row.avatarAssetId ?? null) as string | null,
    viewCount:
      typeof row.view_count === "number"
        ? row.view_count
        : typeof row.viewCount === "number"
          ? row.viewCount
          : 0,
    lastViewedAt: (row.last_viewed_at ?? row.lastViewedAt ?? null) as string | null,
    readyAt: (row.ready_at ?? row.readyAt ?? null) as string | null,
    metadata: (row.metadata ?? null) as Path["metadata"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapPathNode(raw: BackendPathNode | PathNode | null | undefined): PathNode | null {
  if (!raw) return null;
  const row = raw as PathNodeRecord;
  return {
    id: String(row.id),
    pathId: (row.path_id ?? row.pathId ?? null) as string | null,
    index: typeof row.index === "number" ? row.index : 0,
    title: row.title ?? "",
    parentNodeId: (row.parent_node_id ?? row.parentNodeId ?? null) as string | null,
    gating: (row.gating ?? null) as PathNode["gating"],
    avatarUrl: (row.avatar_url ?? row.avatarUrl ?? null) as string | null,
    avatarSquareUrl: (row.avatar_square_url ?? row.avatarSquareUrl ?? null) as string | null,
    avatarAssetId: (row.avatar_asset_id ?? row.avatarAssetId ?? null) as string | null,
    metadata: (row.metadata ?? null) as PathNode["metadata"],
    contentJson: (row.content_json ?? row.contentJson ?? null) as PathNode["contentJson"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapConcept(raw: BackendConcept | Concept | null | undefined): Concept | null {
  if (!raw) return null;
  const row = raw as ConceptRecord;
  return {
    id: String(row.id),
    scope: (row.scope ?? null) as string | null,
    scopeId: (row.scope_id ?? row.scopeId ?? null) as string | null,
    parentId: (row.parent_id ?? row.parentId ?? null) as string | null,
    depth: typeof row.depth === "number" ? row.depth : 0,
    sortIndex: typeof row.sort_index === "number" ? row.sort_index : row.sortIndex ?? 0,
    key: row.key ?? "",
    name: row.name ?? "",
    summary: row.summary ?? "",
    keyPoints: (row.key_points ?? row.keyPoints ?? []) as string[],
    metadata: (row.metadata ?? null) as Concept["metadata"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapConceptEdge(raw: BackendConceptEdge | ConceptEdge | null | undefined): ConceptEdge | null {
  if (!raw) return null;
  const row = raw as ConceptEdgeRecord;
  return {
    id: String(row.id),
    fromConceptId:
      (row.from_concept_id ?? row.fromConceptId ?? null) as string | null,
    toConceptId:
      (row.to_concept_id ?? row.toConceptId ?? null) as string | null,
    edgeType: row.edge_type ?? row.edgeType ?? "",
    strength: typeof row.strength === "number" ? row.strength : 1,
    evidence: (row.evidence ?? null) as ConceptEdge["evidence"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export async function listPaths(): Promise<Path[]> {
  const resp = await axiosClient.get<BackendPathListResponse>("/paths");
  const raws = resp.data?.paths || [];
  return raws.map(mapPath).filter(Boolean) as Path[];
}

export async function getPath(pathId: string): Promise<Path | null> {
  if (!pathId) throw new Error("getPath: missing pathId");
  const resp = await axiosClient.get<BackendPathDetailResponse>(`/paths/${pathId}`);
  return mapPath(resp.data?.path ?? null);
}

export async function recordPathView(pathId: string): Promise<Path | null> {
  if (!pathId) throw new Error("recordPathView: missing pathId");
  const resp = await axiosClient.post<BackendPathDetailResponse>(`/paths/${pathId}/view`, {});
  return mapPath(resp.data?.path ?? null);
}

export async function generatePathCover(pathId: string, force = false): Promise<Path | null> {
  if (!pathId) throw new Error("generatePathCover: missing pathId");
  const payload = force ? { force: true } : {};
  const resp = await axiosClient.post<BackendPathDetailResponse>(`/paths/${pathId}/cover`, payload);
  return mapPath(resp.data?.path ?? null);
}

export async function listNodesForPath(pathId: string): Promise<PathNode[]> {
  if (!pathId) throw new Error("listNodesForPath: missing pathId");
  const resp = await axiosClient.get<BackendPathNodesResponse>(`/paths/${pathId}/nodes`);
  const raws = resp.data?.nodes || [];
  return raws.map(mapPathNode).filter(Boolean) as PathNode[];
}

export async function getConceptGraph(pathId: string): Promise<{
  concepts: Concept[];
  edges: ConceptEdge[];
}> {
  if (!pathId) throw new Error("getConceptGraph: missing pathId");
  const resp = await axiosClient.get<BackendConceptGraphResponse>(`/paths/${pathId}/concept-graph`);
  const concepts = (resp.data?.concepts || []).map(mapConcept).filter(Boolean) as Concept[];
  const edges = (resp.data?.edges || []).map(mapConceptEdge).filter(Boolean) as ConceptEdge[];
  return { concepts, edges };
}
