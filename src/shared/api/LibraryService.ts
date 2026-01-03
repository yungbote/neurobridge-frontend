import axiosClient from "./AxiosClient";
import type { BackendLibraryTaxonomyResponse, BackendLibraryTaxonomySnapshotV1 } from "@/shared/types/backend";

export async function getLibraryTaxonomySnapshot(): Promise<BackendLibraryTaxonomySnapshotV1 | null> {
  const resp = await axiosClient.get<BackendLibraryTaxonomyResponse>("/library/taxonomy");
  return resp.data?.snapshot ?? null;
}

