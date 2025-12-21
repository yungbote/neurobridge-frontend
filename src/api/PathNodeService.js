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

export async function listActivitiesForNode(pathNodeId) {
  if (!pathNodeId) throw new Error("listActivitiesForNode: missing pathNodeId");
  const resp = await axiosClient.get(`/path-nodes/${pathNodeId}/activities`);
  const raws = resp.data?.activities || [];
  return raws.map(mapNodeActivity).filter(Boolean);
}

