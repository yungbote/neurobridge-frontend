import axiosClient from "./AxiosClient";
import { mapPath, mapPathNode } from "./PathService";

export function mapActivity(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    ownerType: raw.owner_type ?? raw.ownerType ?? null,
    ownerId: raw.owner_id ?? raw.ownerId ?? null,
    kind: raw.kind ?? "reading",
    title: raw.title ?? "",
    contentMd: raw.content_md ?? raw.contentMd ?? "",
    contentJson: raw.content_json ?? raw.contentJson ?? null,
    estimatedMinutes:
      typeof raw.estimated_minutes === "number"
        ? raw.estimated_minutes
        : raw.estimatedMinutes ?? null,
    difficulty: raw.difficulty ?? null,
    status: raw.status ?? "",
    metadata: raw.metadata ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function getActivity(activityId) {
  if (!activityId) throw new Error("getActivity: missing activityId");
  const resp = await axiosClient.get(`/activities/${activityId}`);
  const data = resp?.data ?? resp;

  return {
    activity: mapActivity(data?.activity),
    path: mapPath(data?.path),
    node: mapPathNode(data?.node),
    pathNodeId: data?.path_node_id ?? data?.pathNodeId ?? null,
  };
}

