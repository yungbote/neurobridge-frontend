import axiosClient from "./AxiosClient";
import type {
  BackendLibraryTaxonomyNodeItemsResponse,
  BackendLibraryTaxonomyResponse,
  BackendLibraryTaxonomySnapshotV1,
} from "@/shared/types/backend";
import { mapMaterialFile } from "@/shared/api/MaterialService";
import { mapPath } from "@/shared/api/PathService";
import type { MaterialFile, Path } from "@/shared/types/models";

export type LibraryTaxonomyNodeItem =
  | { kind: "path"; path: Path }
  | { kind: "material"; file: MaterialFile };

export async function getLibraryTaxonomySnapshot(): Promise<BackendLibraryTaxonomySnapshotV1 | null> {
  const resp = await axiosClient.get<BackendLibraryTaxonomyResponse>("/library/taxonomy");
  return resp.data?.snapshot ?? null;
}

export async function listTaxonomyNodeItems(
  nodeId: string,
  {
    facet = "topic",
    filter = "all",
    limit = 30,
    cursor,
  }: {
    facet?: string;
    filter?: "all" | "paths" | "files";
    limit?: number;
    cursor?: string | null;
  } = {}
): Promise<{ items: LibraryTaxonomyNodeItem[]; nextCursor: string | null }> {
  if (!nodeId) throw new Error("listTaxonomyNodeItems: missing nodeId");
  const params: Record<string, string | number> = { facet, filter, limit };
  const cur = String(cursor || "").trim();
  if (cur) params.cursor = cur;

  const resp = await axiosClient.get<BackendLibraryTaxonomyNodeItemsResponse>(
    `/library/taxonomy/nodes/${encodeURIComponent(nodeId)}/items`,
    { params }
  );

  const rawItems = resp.data?.items || [];
  const out: LibraryTaxonomyNodeItem[] = [];
  for (const item of rawItems) {
    const kind = String(item?.kind || "");
    if (kind === "path") {
      const mapped = mapPath(item?.path ?? null);
      if (mapped) out.push({ kind: "path", path: mapped });
      continue;
    }
    if (kind === "material") {
      const mapped = mapMaterialFile(item?.file ?? null);
      if (mapped) out.push({ kind: "material", file: mapped });
      continue;
    }
  }

  const next = resp.data?.next_cursor ?? null;
  const nextCursor = typeof next === "string" && next.trim() ? next.trim() : null;
  return { items: out, nextCursor };
}
