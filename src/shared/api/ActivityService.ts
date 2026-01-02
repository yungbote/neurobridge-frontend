import axiosClient from "./AxiosClient";
import { mapPath, mapPathNode } from "./PathService";
import type { BackendActivity, BackendActivityDetailResponse } from "@/shared/types/backend";
import type { Activity, Path, PathNode } from "@/shared/types/models";

type ActivityRecord = BackendActivity & Partial<Activity>;

export function mapActivity(raw: BackendActivity | Activity | null | undefined): Activity | null {
  if (!raw) return null;
  const row = raw as ActivityRecord;
  return {
    id: String(row.id),
    ownerType: (row.owner_type ?? row.ownerType ?? null) as string | null,
    ownerId: (row.owner_id ?? row.ownerId ?? null) as string | null,
    kind: row.kind ?? "reading",
    title: row.title ?? "",
    contentMd: row.content_md ?? row.contentMd ?? "",
    contentJson: (row.content_json ?? row.contentJson ?? null) as Activity["contentJson"],
    estimatedMinutes:
      typeof row.estimated_minutes === "number"
        ? row.estimated_minutes
        : (row.estimatedMinutes ?? null),
    difficulty: (row.difficulty ?? null) as string | null,
    status: row.status ?? "",
    metadata: (row.metadata ?? null) as Activity["metadata"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export async function getActivity(
  activityId: string
): Promise<{
  activity: Activity | null;
  path: Path | null;
  node: PathNode | null;
  pathNodeId: string | null;
}> {
  if (!activityId) throw new Error("getActivity: missing activityId");
  const resp = await axiosClient.get<BackendActivityDetailResponse>(`/activities/${activityId}`);
  const data = resp?.data ?? resp;

  return {
    activity: mapActivity(data?.activity ?? null),
    path: mapPath(data?.path ?? null),
    node: mapPathNode(data?.node ?? null),
    pathNodeId: (data?.path_node_id ?? (data as { pathNodeId?: string })?.pathNodeId ?? null) as string | null,
  };
}
