import type { ISODateTimeString, JsonValue, UUID } from "./common";
import type { BackendPath, BackendPathNode } from "./paths";

export interface BackendActivity {
  id: UUID | string;
  owner_type?: string | null;
  owner_id?: UUID | string | null;
  kind?: string;
  title?: string;
  content_md?: string;
  content_json?: JsonValue | string | null;
  estimated_minutes?: number | null;
  difficulty?: string | null;
  status?: string;
  metadata?: JsonValue | string | null;
  created_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
}

export interface BackendNodeActivity {
  id: UUID | string;
  path_node_activity_id?: UUID | string | null;
  path_node_id?: UUID | string | null;
  rank?: number;
  is_primary?: boolean;
  kind?: string;
  title?: string;
  estimated_minutes?: number | null;
  difficulty?: string | null;
  status?: string;
}

export interface BackendActivityDetailResponse {
  activity?: BackendActivity | null;
  path?: BackendPath | null;
  node?: BackendPathNode | null;
  path_node_id?: UUID | string | null;
}
