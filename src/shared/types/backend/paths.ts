import type { ISODateTimeString, JsonValue, UUID } from "./common";

export interface BackendPath {
  id: UUID | string;
  user_id?: UUID | string | null;
  title?: string;
  description?: string;
  status?: string;
  job_id?: UUID | string | null;
  material_set_id?: UUID | string | null;
  job_status?: string | null;
  job_stage?: string | null;
  job_progress?: number | null;
  job_message?: string | null;
  avatar_url?: string | null;
  avatar_square_url?: string | null;
  avatar_asset_id?: UUID | string | null;
  view_count?: number | null;
  last_viewed_at?: ISODateTimeString | null;
  ready_at?: ISODateTimeString | null;
  metadata?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendPathNode {
  id: UUID | string;
  path_id?: UUID | string | null;
  index?: number;
  title?: string;
  parent_node_id?: UUID | string | null;
  gating?: JsonValue | string | null;
  avatar_url?: string | null;
  avatar_square_url?: string | null;
  avatar_asset_id?: UUID | string | null;
  metadata?: JsonValue | string | null;
  content_json?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendConcept {
  id: UUID | string;
  scope?: string | null;
  scope_id?: UUID | string | null;
  parent_id?: UUID | string | null;
  depth?: number;
  sort_index?: number;
  key?: string;
  name?: string;
  summary?: string;
  key_points?: string[];
  metadata?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendConceptEdge {
  id: UUID | string;
  from_concept_id?: UUID | string | null;
  to_concept_id?: UUID | string | null;
  edge_type?: string;
  strength?: number | null;
  evidence?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendPathListResponse {
  paths?: BackendPath[];
}

export interface BackendPathDetailResponse {
  path?: BackendPath | null;
}

export interface BackendPathNodesResponse {
  nodes?: BackendPathNode[];
}

export interface BackendConceptGraphResponse {
  concepts?: BackendConcept[];
  edges?: BackendConceptEdge[];
}

export interface BackendNodeDocRevision {
  id?: UUID | string;
  block_id?: string;
  block_index?: number | null;
  path_node_id?: UUID | string | null;
  before_json?: JsonValue | string | null;
  after_json?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
}

export interface BackendNodeDocRevisionResponse {
  revisions?: BackendNodeDocRevision[];
}
