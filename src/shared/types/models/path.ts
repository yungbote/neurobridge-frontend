import type { JsonInput } from "./common";

export interface Path {
  id: string;
  userId: string | null;
  title: string;
  description: string;
  status: string;
  jobId: string | null;
  jobType?: string;
  jobStatus?: string | null;
  jobStage?: string | null;
  jobProgress?: number | null;
  jobMessage?: string | null;
  avatarUrl?: string | null;
  avatarSquareUrl?: string | null;
  avatarAssetId?: string | null;
  viewCount?: number | null;
  lastViewedAt?: string | null;
  metadata: JsonInput;
  materialSetId?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PathNode {
  id: string;
  pathId: string | null;
  index: number;
  title: string;
  parentNodeId: string | null;
  gating: JsonInput;
  avatarUrl?: string | null;
  avatarSquareUrl?: string | null;
  avatarAssetId?: string | null;
  metadata: JsonInput;
  contentJson: JsonInput;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Concept {
  id: string;
  scope: string | null;
  scopeId: string | null;
  parentId: string | null;
  depth: number;
  sortIndex: number;
  key: string;
  name: string;
  summary: string;
  keyPoints: string[];
  metadata: JsonInput;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ConceptEdge {
  id: string;
  fromConceptId: string | null;
  toConceptId: string | null;
  edgeType: string;
  strength: number;
  evidence: JsonInput;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DrillSpec {
  kind: string;
  label: string;
  reason: string;
  suggestedCount: number | null;
}

export interface NodeDocRevision {
  id?: string;
  blockId?: string;
  blockIndex?: number | null;
  pathNodeId?: string | null;
  beforeJson?: JsonInput;
  afterJson?: JsonInput;
  createdAt?: string | null;
}
