import type { JsonInput } from "./common";

export interface MaterialFile {
  id: string;
  materialSetId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  storageKey: string;
  fileUrl: string;
  status: string;
  extractedKind: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MaterialAsset {
  id: string;
  materialFileId: string | null;
  kind: string;
  storageKey: string;
  url: string;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  metadata: JsonInput;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MaterialListing {
  materialSetId: string | null;
  files: MaterialFile[];
  assets: MaterialAsset[];
  assetsByFile: Record<string, MaterialAsset[]>;
}
