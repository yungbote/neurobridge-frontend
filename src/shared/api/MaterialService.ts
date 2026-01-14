import axiosClient from "./AxiosClient";
import type {
  BackendMaterialAsset,
  BackendMaterialFile,
  BackendMaterialFileListResponse,
  BackendMaterialListing,
  BackendMaterialUploadResponse,
} from "@/shared/types/backend";
import type { MaterialAsset, MaterialFile, MaterialListing } from "@/shared/types/models";

export async function uploadMaterialSet(
  files: File[],
  { prompt }: { prompt?: string } = {}
): Promise<BackendMaterialUploadResponse> {
  const trimmedPrompt = String(prompt || "").trim();
  const hasFiles = Array.isArray(files) && files.length > 0;
  if (!hasFiles && !trimmedPrompt) {
    throw new Error("uploadMaterialSet: provide files or a prompt");
  }
  const formData = new FormData();
  for (const file of files || []) {
    formData.append("files", file);
  }
  if (trimmedPrompt) {
    formData.append("prompt", trimmedPrompt);
  }

  // IMPORTANT: don't set Content-Type manually for multipart; axios will set boundary
  // Uploads can take longer than typical API calls (local disk, large PDFs, remote blob store, etc).
  // Keep this request-specific timeout generous without slowing down normal API calls.
  const totalBytes = (files || []).reduce((sum, f) => sum + (f?.size ?? 0), 0);
  const totalMB = Math.max(1, Math.ceil(totalBytes/(1024*1024)));
  const timeoutMs = hasFiles ? Math.min(10*60_000, Math.max(60_000, totalMB*30_000)) : 30_000;

  const resp = await axiosClient.post<BackendMaterialUploadResponse>("/material-sets/upload", formData, {
    timeout: timeoutMs,
  });
  return resp.data;
}

type MaterialFileRecord = BackendMaterialFile & Partial<MaterialFile>;
type MaterialAssetRecord = BackendMaterialAsset & Partial<MaterialAsset>;

export function mapMaterialFile(raw: BackendMaterialFile | MaterialFile | null | undefined): MaterialFile | null {
  if (!raw) return null;
  const row = raw as MaterialFileRecord;
  return {
    id: String(row.id),
    materialSetId: (row.material_set_id ?? row.materialSetId ?? null) as string | null,
    originalName: row.original_name ?? row.originalName ?? "",
    mimeType: row.mime_type ?? row.mimeType ?? "",
    sizeBytes:
      typeof row.size_bytes === "number"
        ? row.size_bytes
        : typeof row.sizeBytes === "number"
          ? row.sizeBytes
          : null,
    storageKey: row.storage_key ?? row.storageKey ?? "",
    fileUrl: row.file_url ?? row.fileUrl ?? "",
    status: row.status ?? "",
    extractedKind: row.extracted_kind ?? row.extractedKind ?? "",
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapMaterialAsset(raw: BackendMaterialAsset | MaterialAsset | null | undefined): MaterialAsset | null {
  if (!raw) return null;
  const row = raw as MaterialAssetRecord;
  return {
    id: String(row.id),
    materialFileId: (row.material_file_id ?? row.materialFileId ?? null) as string | null,
    kind: row.kind ?? "",
    storageKey: row.storage_key ?? row.storageKey ?? "",
    url: row.url ?? "",
    page: typeof row.page === "number" ? row.page : (row.page ?? null),
    startSec: typeof row.start_sec === "number" ? row.start_sec : (row.startSec ?? null),
    endSec: typeof row.end_sec === "number" ? row.end_sec : (row.endSec ?? null),
    metadata: (row.metadata ?? null) as MaterialAsset["metadata"],
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export async function listPathMaterials(pathId: string): Promise<MaterialListing> {
  if (!pathId) throw new Error("listPathMaterials: missing pathId");
  const resp = await axiosClient.get<BackendMaterialListing>(`/paths/${pathId}/materials`);
  const files = (resp.data?.files || []).map(mapMaterialFile).filter(Boolean) as MaterialFile[];
  const assets = (resp.data?.assets || []).map(mapMaterialAsset).filter(Boolean) as MaterialAsset[];
  const assetsByFile = resp.data?.assets_by_file || {};
  const normalizedAssetsByFile: Record<string, MaterialAsset[]> = {};
  Object.entries(assetsByFile).forEach(([fileId, rows]) => {
    normalizedAssetsByFile[fileId] = (rows || []).map(mapMaterialAsset).filter(Boolean) as MaterialAsset[];
  });
  return {
    materialSetId: (resp.data?.material_set_id ?? null) as string | null,
    files,
    assets,
    assetsByFile: normalizedAssetsByFile,
  };
}

export async function listUserMaterialFiles(): Promise<MaterialFile[]> {
  const resp = await axiosClient.get<BackendMaterialFileListResponse>("/material-files");
  const raws = resp.data?.files || [];
  return raws.map(mapMaterialFile).filter(Boolean) as MaterialFile[];
}



