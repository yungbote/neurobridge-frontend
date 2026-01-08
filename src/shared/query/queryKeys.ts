export const queryKeys = {
  me: () => ["me"] as const,
  paths: () => ["paths"] as const,
  path: (id: string) => ["paths", id] as const,
  pathNodes: (pathId: string) => ["pathNodes", pathId] as const,
  materialFiles: () => ["materialFiles"] as const,
  chatThreads: ({
    pathId = null,
    limit = null,
  }: {
    pathId?: string | null;
    limit?: number | null;
  } = {}) => ["chatThreads", { pathId, limit }] as const,
  libraryTaxonomySnapshot: () => ["libraryTaxonomySnapshot"] as const,
} as const;

