import axiosClient from "./AxiosClient";

export async function uploadMaterialSet(files) {
  if (!files || files.length === 0) {
    throw new Error("uploadMaterialSet: no files provided");
  }
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  // IMPORTANT: don't set Content-Type manually for multipart; axios will set boundary
  const resp = await axiosClient.post("/material-sets/upload", formData);
  return resp.data;
}

export function mapMaterialFile(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    materialSetId: raw.material_set_id ?? raw.materialSetId ?? null,
    originalName: raw.original_name ?? raw.originalName ?? "",
    mimeType: raw.mime_type ?? raw.mimeType ?? "",
    sizeBytes:
      typeof raw.size_bytes === "number"
        ? raw.size_bytes
        : typeof raw.sizeBytes === "number"
          ? raw.sizeBytes
          : null,
    storageKey: raw.storage_key ?? raw.storageKey ?? "",
    fileUrl: raw.file_url ?? raw.fileUrl ?? "",
    status: raw.status ?? "",
    extractedKind: raw.extracted_kind ?? raw.extractedKind ?? "",
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapMaterialAsset(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    materialFileId: raw.material_file_id ?? raw.materialFileId ?? null,
    kind: raw.kind ?? "",
    storageKey: raw.storage_key ?? raw.storageKey ?? "",
    url: raw.url ?? "",
    page: typeof raw.page === "number" ? raw.page : raw.page ?? null,
    startSec: typeof raw.start_sec === "number" ? raw.start_sec : raw.startSec ?? null,
    endSec: typeof raw.end_sec === "number" ? raw.end_sec : raw.endSec ?? null,
    metadata: raw.metadata ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function listPathMaterials(pathId) {
  if (!pathId) throw new Error("listPathMaterials: missing pathId");
  const resp = await axiosClient.get(`/paths/${pathId}/materials`);
  const files = (resp.data?.files || []).map(mapMaterialFile).filter(Boolean);
  const assets = (resp.data?.assets || []).map(mapMaterialAsset).filter(Boolean);
  const assetsByFile = resp.data?.assets_by_file || {};
  const normalizedAssetsByFile = {};
  Object.entries(assetsByFile).forEach(([fileId, rows]) => {
    normalizedAssetsByFile[fileId] = (rows || []).map(mapMaterialAsset).filter(Boolean);
  });
  return {
    materialSetId: resp.data?.material_set_id ?? null,
    files,
    assets,
    assetsByFile: normalizedAssetsByFile,
  };
}









