import type { JsonInput } from "./common";

export interface NodeActivity {
  id: string;
  pathNodeActivityId: string | null;
  pathNodeId: string | null;
  rank: number;
  isPrimary: boolean;
  kind: string;
  title: string;
  estimatedMinutes: number | null;
  difficulty: string | null;
  status: string;
}

export interface Activity {
  id: string;
  ownerType: string | null;
  ownerId: string | null;
  kind: string;
  title: string;
  contentMd: string;
  contentJson: JsonInput;
  estimatedMinutes: number | null;
  difficulty: string | null;
  status: string;
  metadata: JsonInput;
  createdAt: string | null;
  updatedAt: string | null;
}
