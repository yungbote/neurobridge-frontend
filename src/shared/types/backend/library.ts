export interface BackendLibraryTaxonomyPathMembershipV1 {
  path_id: string;
  weight: number;
}

export interface BackendLibraryTaxonomyNodeMembershipV1 {
  node_id: string;
  paths: BackendLibraryTaxonomyPathMembershipV1[];
}

export interface BackendLibraryTaxonomyNodeV1 {
  id: string;
  key: string;
  kind: string;
  name: string;
  description: string;
  member_count: number;
}

export interface BackendLibraryTaxonomyEdgeV1 {
  id: string;
  kind: string;
  from_node_id: string;
  to_node_id: string;
  weight: number;
}

export interface BackendLibraryTaxonomyFacetV1 {
  facet: string;
  title: string;
  root_node_id: string;
  inbox_node_id: string;
  nodes: BackendLibraryTaxonomyNodeV1[];
  edges: BackendLibraryTaxonomyEdgeV1[];
  memberships: BackendLibraryTaxonomyNodeMembershipV1[];
}

export interface BackendLibraryTaxonomySnapshotV1 {
  version: number;
  generated_at: string;
  user_id: string;
  facets: Record<string, BackendLibraryTaxonomyFacetV1>;
}

export interface BackendLibraryTaxonomyResponse {
  snapshot: BackendLibraryTaxonomySnapshotV1 | null;
  enqueued_refine?: boolean;
}

