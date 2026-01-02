import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendMaterialFile {
  id: UUID;
  material_set_id?: UUID | null;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number | null;
  storage_key?: string;
  file_url?: string;
  status?: string;
  extracted_kind?: string;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendMaterialAsset {
  id: UUID;
  material_file_id?: UUID | null;
  kind?: string;
  storage_key?: string;
  url?: string;
  page?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  metadata?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendMaterialListing {
  material_set_id?: UUID | null;
  files?: BackendMaterialFile[];
  assets?: BackendMaterialAsset[];
  assets_by_file?: Record<string, BackendMaterialAsset[]>;
}

export interface BackendMaterialUploadResponse {
  job_id?: UUID | string | null;
  material_set_id?: UUID | string | null;
  path_id?: UUID | string | null;
  thread_id?: UUID | string | null;
  jobId?: UUID | string | null;
  materialSetId?: UUID | string | null;
  pathId?: UUID | string | null;
  threadId?: UUID | string | null;
}
